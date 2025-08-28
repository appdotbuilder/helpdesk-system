import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input data
const testUserInput: CreateUserInput = {
  username: 'testuser',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'CS',
  is_active: true
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with all required fields', async () => {
    const result = await createUser(testUserInput);

    // Verify all basic fields
    expect(result.username).toEqual('testuser');
    expect(result.email).toEqual('test@example.com');
    expect(result.full_name).toEqual('Test User');
    expect(result.role).toEqual('CS');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.id).toBeGreaterThan(0);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save user to database correctly', async () => {
    const result = await createUser(testUserInput);

    // Query the database to verify the user was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    const savedUser = users[0];
    expect(savedUser.username).toEqual('testuser');
    expect(savedUser.email).toEqual('test@example.com');
    expect(savedUser.full_name).toEqual('Test User');
    expect(savedUser.role).toEqual('CS');
    expect(savedUser.is_active).toEqual(true);
    expect(savedUser.created_at).toBeInstanceOf(Date);
    expect(savedUser.updated_at).toBeInstanceOf(Date);
  });

  it('should default is_active to true when not provided', async () => {
    const inputWithoutIsActive: CreateUserInput = {
      username: 'defaultuser',
      email: 'default@example.com',
      full_name: 'Default User',
      role: 'TSO'
    };

    const result = await createUser(inputWithoutIsActive);

    expect(result.is_active).toEqual(true);

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users[0].is_active).toEqual(true);
  });

  it('should create user with is_active set to false when explicitly provided', async () => {
    const inactiveUserInput: CreateUserInput = {
      username: 'inactiveuser',
      email: 'inactive@example.com',
      full_name: 'Inactive User',
      role: 'NOC',
      is_active: false
    };

    const result = await createUser(inactiveUserInput);

    expect(result.is_active).toEqual(false);

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users[0].is_active).toEqual(false);
  });

  it('should create users with different roles', async () => {
    const csUser: CreateUserInput = {
      username: 'csuser',
      email: 'cs@example.com',
      full_name: 'CS User',
      role: 'CS'
    };

    const tsoUser: CreateUserInput = {
      username: 'tsouser',
      email: 'tso@example.com',
      full_name: 'TSO User',
      role: 'TSO'
    };

    const nocUser: CreateUserInput = {
      username: 'nocuser',
      email: 'noc@example.com',
      full_name: 'NOC User',
      role: 'NOC'
    };

    const csResult = await createUser(csUser);
    const tsoResult = await createUser(tsoUser);
    const nocResult = await createUser(nocUser);

    expect(csResult.role).toEqual('CS');
    expect(tsoResult.role).toEqual('TSO');
    expect(nocResult.role).toEqual('NOC');

    // Verify all users were created with unique IDs
    expect(csResult.id).not.toEqual(tsoResult.id);
    expect(tsoResult.id).not.toEqual(nocResult.id);
    expect(csResult.id).not.toEqual(nocResult.id);
  });

  it('should handle unique constraint violations', async () => {
    // Create first user
    await createUser(testUserInput);

    // Try to create another user with same username
    const duplicateUsernameInput: CreateUserInput = {
      username: 'testuser', // Same username
      email: 'different@example.com',
      full_name: 'Different User',
      role: 'TSO'
    };

    await expect(createUser(duplicateUsernameInput)).rejects.toThrow(/unique/i);

    // Try to create another user with same email
    const duplicateEmailInput: CreateUserInput = {
      username: 'differentuser',
      email: 'test@example.com', // Same email
      full_name: 'Different User',
      role: 'NOC'
    };

    await expect(createUser(duplicateEmailInput)).rejects.toThrow(/unique/i);
  });

  it('should set timestamps correctly', async () => {
    const beforeCreation = new Date();
    const result = await createUser(testUserInput);
    const afterCreation = new Date();

    // Verify timestamps are within expected range
    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    expect(result.updated_at.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
    expect(result.updated_at.getTime()).toBeLessThanOrEqual(afterCreation.getTime());

    // In a new creation, created_at and updated_at should be the same
    expect(Math.abs(result.created_at.getTime() - result.updated_at.getTime())).toBeLessThan(1000);
  });
});