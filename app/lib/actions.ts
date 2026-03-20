'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({ invalid_type_error: 'Customer ID is required' }),
    amount: z.coerce.number()
      .gt(0, { message: 'Please enter an amount greater than 0' }),
    status: z.enum(['pending', 'paid'], {
      invalid_type_error: 'Please select a valid status'
    }),
    date: z.string(),
});

// Using Zod to validate data from the form.
const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message: string;
};

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid email or password.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error; // Re-throw unexpected errors
  }
}

// Action function to create a new invoice. It receives the form data, validates it, and then inserts it into the database.
// After that, it revalidates the invoices page and redirects the user back to the invoices list.
export async function createInvoice(prevState: State, formData: FormData) {
    // Validate form data using Zod.
    const validatedFields  = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // If form validation fails, return errors early. Otherwise, continue.
    if (!validatedFields.success) {
      console.log( { validatedFields })
      return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Missing Fields: Failed to Create Invoice.',
      }
    }

    // Parse data for insertion into the database.
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];
    
    // Insert data inento the database.
    try {
        await sql`
            INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    } catch (error) {
        // If database error occurs, return a more specific error.
        console.error(error);
        return { message: 'Database Error: Failed to Create Invoice.' };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

// Action function to update an existing invoice. It receives the invoice ID and form data,
//  validates the data, and then updates the corresponding record in the database.
// After that, it revalidates the invoices page and redirects the user back to the invoices list.
export async function updateInvoice(id: string, prevState: State, formData: FormData) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
 
  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    console.log({ validatedFields });
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields: Failed to Update Invoice.',
    };
  }

  // Parse data for updating the database.
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
 
  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    // If database error occurs, return a more specific error.
    console.error(error);
    return { message: 'Database Error: Failed to Update Invoice.' };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}
// Action function to delete an invoice. It receives the invoice ID, deletes the
//  corresponding record from the database, revalidates the invoices page.
export async function deleteInvoice(id: string) {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
}