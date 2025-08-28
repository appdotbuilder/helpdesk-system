import { serial, text, pgTable, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define PostgreSQL enums
export const userRoleEnum = pgEnum('user_role', ['CS', 'TSO', 'NOC']);
export const customerCategoryEnum = pgEnum('customer_category', ['broadband', 'dedicated', 'reseller']);
export const ticketStatusEnum = pgEnum('ticket_status', ['New', 'In Progress', 'Pending', 'Cancel', 'Solved']);
export const issuePriorityEnum = pgEnum('issue_priority', ['Low', 'Medium', 'High', 'Critical']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  full_name: text('full_name').notNull(),
  role: userRoleEnum('role').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Complaint tickets table
export const complaintTicketsTable = pgTable('complaint_tickets', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id').notNull(),
  customer_name: text('customer_name').notNull(),
  customer_address: text('customer_address').notNull(),
  customer_category: customerCategoryEnum('customer_category').notNull(),
  issue_description: text('issue_description').notNull(),
  issue_priority: issuePriorityEnum('issue_priority').notNull(),
  status: ticketStatusEnum('status').notNull().default('New'),
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  assigned_to: integer('assigned_to').references(() => usersTable.id),
  assigned_team: userRoleEnum('assigned_team'),
  resolution_notes: text('resolution_notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  resolved_at: timestamp('resolved_at')
});

// Ticket history table for audit trail
export const ticketHistoryTable = pgTable('ticket_history', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => complaintTicketsTable.id),
  action: text('action').notNull(), // 'created', 'assigned', 'status_changed', 'transferred', etc.
  previous_value: text('previous_value'),
  new_value: text('new_value'),
  performed_by: integer('performed_by').notNull().references(() => usersTable.id),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  createdTickets: many(complaintTicketsTable, {
    relationName: 'created_by'
  }),
  assignedTickets: many(complaintTicketsTable, {
    relationName: 'assigned_to'
  }),
  ticketHistoryActions: many(ticketHistoryTable)
}));

export const complaintTicketsRelations = relations(complaintTicketsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [complaintTicketsTable.created_by],
    references: [usersTable.id],
    relationName: 'created_by'
  }),
  assignee: one(usersTable, {
    fields: [complaintTicketsTable.assigned_to],
    references: [usersTable.id],
    relationName: 'assigned_to'
  }),
  history: many(ticketHistoryTable)
}));

export const ticketHistoryRelations = relations(ticketHistoryTable, ({ one }) => ({
  ticket: one(complaintTicketsTable, {
    fields: [ticketHistoryTable.ticket_id],
    references: [complaintTicketsTable.id]
  }),
  performer: one(usersTable, {
    fields: [ticketHistoryTable.performed_by],
    references: [usersTable.id]
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type ComplaintTicket = typeof complaintTicketsTable.$inferSelect;
export type NewComplaintTicket = typeof complaintTicketsTable.$inferInsert;

export type TicketHistory = typeof ticketHistoryTable.$inferSelect;
export type NewTicketHistory = typeof ticketHistoryTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  complaintTickets: complaintTicketsTable,
  ticketHistory: ticketHistoryTable
};