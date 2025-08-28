import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserInput } from '../schema';
import { updateUser } from '../handlers/update_user';
import { eq } from 'drizzle-orm';

describe('updateUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create a test user directly in the database
  const createTestUser = async () => {
    const result = await db.insert(usersTable)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'CS',
        is_active: true
      })
      .returning()
      .execute();
    
    return result[0];
  };

  it('should update user fields successfully', async () => {
    // Create test user first
    const createdUser = await createTestUser();

    const updateInput: UpdateUserInput = {
      id: createdUser.id,
      username: 'updateduser',
      email: 'updated@example.com',
      full_name: 'Updated User',
      role: 'TSO',
      is_active: false
    };

    const result = await updateUser(updateInput);

    // Verify update result
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.username).toEqual('updateduser');
    expect(result!.email).toEqual('updated@example.com');
    expect(result!.full_name).toEqual('Updated User');
    expect(result!.role).toEqual('TSO');
    expect(result!.is_active).toEqual(false);
    expect(result!.updated_at).toBeInstanceOf(Date);
    expect(result!.updated_at > createdUser.updated_at).toBe(true);
  });

  it('should update only specified fields', async () => {
    // Create test user first
    const createdUser = await createTestUser();

    const updateInput: UpdateUserInput = {
      id: createdUser.id,
      role: 'NOC'
    };

    const result = await updateUser(updateInput);

    // Verify partial update
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.username).toEqual(createdUser.username); // Unchanged
    expect(result!.email).toEqual(createdUser.email); // Unchanged
    expect(result!.full_name).toEqual(createdUser.full_name); // Unchanged
    expect(result!.role).toEqual('NOC'); // Changed
    expect(result!.is_active).toEqual(createdUser.is_active); // Unchanged
    expect(result!.updated_at).toBeInstanceOf(Date);
    expect(result!.updated_at > createdUser.updated_at).toBe(true);
  });

  it('should save updated user to database', async () => {
    // Create test user first
    const createdUser = await createTestUser();

    const updateInput: UpdateUserInput = {
      id: createdUser.id,
      email: 'newemail@example.com',
      is_active: false
    };

    await updateUser(updateInput);

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('newemail@example.com');
    expect(users[0].is_active).toEqual(false);
    expect(users[0].username).toEqual(createdUser.username); // Should remain unchanged
    expect(users[0].updated_at).toBeInstanceOf(Date);
    expect(users[0].updated_at > createdUser.updated_at).toBe(true);
  });

  it('should return null for non-existent user', async () => {
    const updateInput: UpdateUserInput = {
      id: 999, // Non-existent ID
      username: 'nonexistent'
    };

    const result = await updateUser(updateInput);

    expect(result).toBeNull();
  });

  it('should handle empty update gracefully', async () => {
    // Create test user first
    const createdUser = await createTestUser();

    const updateInput: UpdateUserInput = {
      id: createdUser.id
      // No fields to update
    };

    const result = await updateUser(updateInput);

    // Should return the existing user unchanged (except updated_at)
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.username).toEqual(createdUser.username);
    expect(result!.email).toEqual(createdUser.email);
    expect(result!.full_name).toEqual(createdUser.full_name);
    expect(result!.role).toEqual(createdUser.role);
    expect(result!.is_active).toEqual(createdUser.is_active);
    expect(result!.created_at).toEqual(createdUser.created_at);
    expect(result!.updated_at).toEqual(createdUser.updated_at); // Should be unchanged for empty update
  });

  it('should handle individual field updates correctly', async () => {
    // Create test user first
    const createdUser = await createTestUser();

    // Test username update
    let result = await updateUser({
      id: createdUser.id,
      username: 'newusername'
    });
    expect(result!.username).toEqual('newusername');

    // Test email update
    result = await updateUser({
      id: createdUser.id,
      email: 'newemail@test.com'
    });
    expect(result!.email).toEqual('newemail@test.com');

    // Test role update
    result = await updateUser({
      id: createdUser.id,
      role: 'NOC'
    });
    expect(result!.role).toEqual('NOC');

    // Test is_active update
    result = await updateUser({
      id: createdUser.id,
      is_active: false
    });
    expect(result!.is_active).toEqual(false);

    // Verify final state in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();

    expect(users[0].username).toEqual('newusername');
    expect(users[0].email).toEqual('newemail@test.com');
    expect(users[0].role).toEqual('NOC');
    expect(users[0].is_active).toEqual(false);
  });

  it('should handle unique constraint violations', async () => {
    // Create two test users
    const user1 = await createTestUser();
    
    const user2 = await db.insert(usersTable)
      .values({
        username: 'testuser2',
        email: 'test2@example.com',
        full_name: 'Test User 2',
        role: 'TSO',
        is_active: true
      })
      .returning()
      .execute();

    // Try to update user2 with user1's username (should fail)
    const updateInput: UpdateUserInput = {
      id: user2[0].id,
      username: user1.username
    };

    await expect(updateUser(updateInput)).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });
});