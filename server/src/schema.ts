import { z } from 'zod';

// Enum definitions
export const UserRoleEnum = z.enum(['CS', 'TSO', 'NOC']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const CustomerCategoryEnum = z.enum(['broadband', 'dedicated', 'reseller']);
export type CustomerCategory = z.infer<typeof CustomerCategoryEnum>;

export const TicketStatusEnum = z.enum(['New', 'In Progress', 'Pending', 'Cancel', 'Solved']);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const IssuePriorityEnum = z.enum(['Low', 'Medium', 'High', 'Critical']);
export type IssuePriority = z.infer<typeof IssuePriorityEnum>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  full_name: z.string(),
  role: UserRoleEnum,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Input schemas for user operations
export const createUserInputSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  full_name: z.string().min(1),
  role: UserRoleEnum,
  is_active: z.boolean().optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  full_name: z.string().min(1).optional(),
  role: UserRoleEnum.optional(),
  is_active: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Complaint ticket schema
export const complaintTicketSchema = z.object({
  id: z.number(),
  customer_id: z.string(),
  customer_name: z.string(),
  customer_address: z.string(),
  customer_category: CustomerCategoryEnum,
  issue_description: z.string(),
  issue_priority: IssuePriorityEnum,
  status: TicketStatusEnum,
  created_by: z.number(), // User ID of CS who created the ticket
  assigned_to: z.number().nullable(), // User ID of assigned team member
  assigned_team: UserRoleEnum.nullable(), // Current team handling the ticket
  resolution_notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  resolved_at: z.coerce.date().nullable()
});

export type ComplaintTicket = z.infer<typeof complaintTicketSchema>;

// Input schemas for complaint ticket operations
export const createComplaintTicketInputSchema = z.object({
  customer_id: z.string().min(1),
  customer_name: z.string().min(1),
  customer_address: z.string().min(1),
  customer_category: CustomerCategoryEnum,
  issue_description: z.string().min(1),
  issue_priority: IssuePriorityEnum,
  created_by: z.number()
});

export type CreateComplaintTicketInput = z.infer<typeof createComplaintTicketInputSchema>;

export const updateComplaintTicketInputSchema = z.object({
  id: z.number(),
  customer_id: z.string().optional(),
  customer_name: z.string().optional(),
  customer_address: z.string().optional(),
  customer_category: CustomerCategoryEnum.optional(),
  issue_description: z.string().optional(),
  issue_priority: IssuePriorityEnum.optional(),
  status: TicketStatusEnum.optional(),
  assigned_to: z.number().nullable().optional(),
  assigned_team: UserRoleEnum.nullable().optional(),
  resolution_notes: z.string().nullable().optional()
});

export type UpdateComplaintTicketInput = z.infer<typeof updateComplaintTicketInputSchema>;

// Ticket assignment schema
export const assignTicketInputSchema = z.object({
  ticket_id: z.number(),
  assigned_to: z.number().nullable(),
  assigned_team: UserRoleEnum,
  assigned_by: z.number()
});

export type AssignTicketInput = z.infer<typeof assignTicketInputSchema>;

// Ticket history/audit schema for tracking changes
export const ticketHistorySchema = z.object({
  id: z.number(),
  ticket_id: z.number(),
  action: z.string(), // 'created', 'assigned', 'status_changed', 'transferred', etc.
  previous_value: z.string().nullable(),
  new_value: z.string().nullable(),
  performed_by: z.number(),
  notes: z.string().nullable(),
  created_at: z.coerce.date()
});

export type TicketHistory = z.infer<typeof ticketHistorySchema>;

export const createTicketHistoryInputSchema = z.object({
  ticket_id: z.number(),
  action: z.string(),
  previous_value: z.string().nullable().optional(),
  new_value: z.string().nullable().optional(),
  performed_by: z.number(),
  notes: z.string().nullable().optional()
});

export type CreateTicketHistoryInput = z.infer<typeof createTicketHistoryInputSchema>;

// Report query schemas
export const monthlyReportQuerySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  team: UserRoleEnum.optional()
});

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

export const workloadAnalysisQuerySchema = z.object({
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  user_id: z.number().optional(),
  team: UserRoleEnum.optional()
});

export type WorkloadAnalysisQuery = z.infer<typeof workloadAnalysisQuerySchema>;

// Filter schemas for ticket queries
export const ticketFilterSchema = z.object({
  status: TicketStatusEnum.optional(),
  priority: IssuePriorityEnum.optional(),
  assigned_team: UserRoleEnum.optional(),
  assigned_to: z.number().optional(),
  customer_category: CustomerCategoryEnum.optional(),
  created_by: z.number().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  customer_id: z.string().optional()
});

export type TicketFilter = z.infer<typeof ticketFilterSchema>;

// Response schemas for analytics
export const userWorkloadStatsSchema = z.object({
  user_id: z.number(),
  username: z.string(),
  full_name: z.string(),
  team: UserRoleEnum,
  total_tickets_handled: z.number(),
  tickets_resolved: z.number(),
  tickets_in_progress: z.number(),
  average_resolution_time_hours: z.number().nullable()
});

export type UserWorkloadStats = z.infer<typeof userWorkloadStatsSchema>;

export const issueTypeStatsSchema = z.object({
  issue_type: z.string(),
  count: z.number(),
  percentage: z.number()
});

export type IssueTypeStats = z.infer<typeof issueTypeStatsSchema>;

export const customerFrequencyStatsSchema = z.object({
  customer_id: z.string(),
  customer_name: z.string(),
  complaint_count: z.number(),
  last_complaint_date: z.coerce.date()
});

export type CustomerFrequencyStats = z.infer<typeof customerFrequencyStatsSchema>;