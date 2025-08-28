import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { getUsers, getUserById } from '../handlers/get_users';

// Test user data
const testUsers: CreateUserInput[] = [
  {
    username: 'cs_user1',
    email: 'cs1@company.com',
    full_name: 'CS User One',
    role: 'CS',
    is_active: true
  },
  {
    username: 'tso_user1',
    email: 'tso1@company.com',
    full_name: 'TSO User One',
    role: 'TSO',
    is_active: true
  },
  {
    username: 'noc_user1',
    email: 'noc1@company.com',
    full_name: 'NOC User One',
    role: 'NOC',
    is_active: true
  },
  {
    username: 'inactive_user',
    email: 'inactive@company.com',
    full_name: 'Inactive User',
    role: 'CS',
    is_active: false
  }
];

describe('getUsers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get all active users when no role filter is provided', async () => {
    // Create test users
    for (const userData of testUsers) {
      await db.insert(usersTable)
        .values(userData)
        .execute();
    }

    const result = await getUsers();

    // Should return only active users (3 out of 4)
    expect(result).toHaveLength(3);
    
    // Verify all returned users are active
    result.forEach(user => {
      expect(user.is_active).toBe(true);
    });

    // Check that we have users from different roles
    const roles = result.map(user => user.role);
    expect(roles).toContain('CS');
    expect(roles).toContain('TSO');
    expect(roles).toContain('NOC');
  });

  it('should filter users by CS role', async () => {
    // Create test users
    for (const userData of testUsers) {
      await db.insert(usersTable)
        .values(userData)
        .execute();
    }

    const result = await getUsers('CS');

    // Should return only active CS users (1 out of 2 CS users, since one is inactive)
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('CS');
    expect(result[0].username).toBe('cs_user1');
    expect(result[0].is_active).toBe(true);
  });

  it('should filter users by TSO role', async () => {
    // Create test users
    for (const userData of testUsers) {
      await db.insert(usersTable)
        .values(userData)
        .execute();
    }

    const result = await getUsers('TSO');

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('TSO');
    expect(result[0].username).toBe('tso_user1');
    expect(result[0].is_active).toBe(true);
  });

  it('should filter users by NOC role', async () => {
    // Create test users
    for (const userData of testUsers) {
      await db.insert(usersTable)
        .values(userData)
        .execute();
    }

    const result = await getUsers('NOC');

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('NOC');
    expect(result[0].username).toBe('noc_user1');
    expect(result[0].is_active).toBe(true);
  });

  it('should return empty array when no users match role filter', async () => {
    // Create only CS users
    await db.insert(usersTable)
      .values({
        username: 'cs_only',
        email: 'cs@company.com',
        full_name: 'CS Only',
        role: 'CS',
        is_active: true
      })
      .execute();

    // Search for NOC users
    const result = await getUsers('NOC');

    expect(result).toHaveLength(0);
  });

  it('should return empty array when no users exist', async () => {
    const result = await getUsers();

    expect(result).toHaveLength(0);
  });

  it('should exclude inactive users even when role matches', async () => {
    // Create only inactive users
    await db.insert(usersTable)
      .values({
        username: 'inactive_cs',
        email: 'inactive@company.com',
        full_name: 'Inactive CS',
        role: 'CS',
        is_active: false
      })
      .execute();

    const result = await getUsers('CS');

    expect(result).toHaveLength(0);
  });

  it('should return users with all required fields', async () => {
    await db.insert(usersTable)
      .values(testUsers[0])
      .execute();

    const result = await getUsers();

    expect(result).toHaveLength(1);
    const user = result[0];
    
    // Verify all required fields are present
    expect(user.id).toBeDefined();
    expect(typeof user.id).toBe('number');
    expect(user.username).toBe('cs_user1');
    expect(user.email).toBe('cs1@company.com');
    expect(user.full_name).toBe('CS User One');
    expect(user.role).toBe('CS');
    expect(user.is_active).toBe(true);
    expect(user.created_at).toBeInstanceOf(Date);
    expect(user.updated_at).toBeInstanceOf(Date);
  });
});

describe('getUserById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get user by valid ID', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values(testUsers[0])
      .returning()
      .execute();

    const createdUser = insertResult[0];
    const result = await getUserById(createdUser.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(createdUser.id);
    expect(result!.username).toBe('cs_user1');
    expect(result!.email).toBe('cs1@company.com');
    expect(result!.full_name).toBe('CS User One');
    expect(result!.role).toBe('CS');
    expect(result!.is_active).toBe(true);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null for non-existent user ID', async () => {
    const result = await getUserById(999);

    expect(result).toBeNull();
  });

  it('should return inactive user by ID', async () => {
    // Create inactive user
    const insertResult = await db.insert(usersTable)
      .values(testUsers[3]) // inactive user
      .returning()
      .execute();

    const createdUser = insertResult[0];
    const result = await getUserById(createdUser.id);

    // getUserById should return inactive users (unlike getUsers which filters them out)
    expect(result).not.toBeNull();
    expect(result!.id).toBe(createdUser.id);
    expect(result!.username).toBe('inactive_user');
    expect(result!.is_active).toBe(false);
  });

  it('should handle zero ID', async () => {
    const result = await getUserById(0);

    expect(result).toBeNull();
  });

  it('should handle negative ID', async () => {
    const result = await getUserById(-1);

    expect(result).toBeNull();
  });
});