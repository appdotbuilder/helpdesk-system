import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User, type UserRole } from '../schema';
import { eq, and } from 'drizzle-orm';

export const getUsers = async (role?: UserRole): Promise<User[]> => {
  try {
    if (role) {
      // Filter by role and active status
      const results = await db.select()
        .from(usersTable)
        .where(and(
          eq(usersTable.is_active, true),
          eq(usersTable.role, role)
        ))
        .execute();
      return results;
    } else {
      // Filter by active status only
      const results = await db.select()
        .from(usersTable)
        .where(eq(usersTable.is_active, true))
        .execute();
      return results;
    }
  } catch (error) {
    console.error('Get users failed:', error);
    throw error;
  }
};

export const getUserById = async (id: number): Promise<User | null> => {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Get user by ID failed:', error);
    throw error;
  }
};