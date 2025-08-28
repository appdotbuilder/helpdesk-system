import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import all schemas
import { 
  createUserInputSchema, 
  updateUserInputSchema,
  createComplaintTicketInputSchema,
  updateComplaintTicketInputSchema,
  assignTicketInputSchema,
  createTicketHistoryInputSchema,
  monthlyReportQuerySchema,
  workloadAnalysisQuerySchema,
  ticketFilterSchema,
  UserRoleEnum
} from './schema';

// Import all handlers
import { createUser } from './handlers/create_user';
import { getUsers, getUserById } from './handlers/get_users';
import { updateUser } from './handlers/update_user';
import { createComplaintTicket } from './handlers/create_complaint_ticket';
import { 
  getComplaintTickets, 
  getComplaintTicketById, 
  getTicketsByAssignee,
  getTicketsByTeam
} from './handlers/get_complaint_tickets';
import { updateComplaintTicket } from './handlers/update_complaint_ticket';
import { assignTicket, transferTicketToTeam } from './handlers/assign_ticket';
import { createTicketHistory, getTicketHistory } from './handlers/ticket_history';
import { 
  generateMonthlyReport,
  getUserWorkloadStats,
  getIssueTypeAnalysis,
  getCustomerFrequencyAnalysis,
  getTeamPerformanceMetrics
} from './handlers/reports';
import { getDashboardMetrics, getUserDashboard } from './handlers/dashboard';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management routes
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUsers: publicProcedure
    .input(z.object({ role: UserRoleEnum.optional() }).optional())
    .query(({ input }) => getUsers(input?.role)),

  getUserById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getUserById(input.id)),

  updateUser: publicProcedure
    .input(updateUserInputSchema)
    .mutation(({ input }) => updateUser(input)),

  // Complaint ticket management routes
  createComplaintTicket: publicProcedure
    .input(createComplaintTicketInputSchema)
    .mutation(({ input }) => createComplaintTicket(input)),

  getComplaintTickets: publicProcedure
    .input(ticketFilterSchema.optional())
    .query(({ input }) => getComplaintTickets(input)),

  getComplaintTicketById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getComplaintTicketById(input.id)),

  getTicketsByAssignee: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getTicketsByAssignee(input.userId)),

  getTicketsByTeam: publicProcedure
    .input(z.object({ team: z.string() }))
    .query(({ input }) => getTicketsByTeam(input.team)),

  updateComplaintTicket: publicProcedure
    .input(updateComplaintTicketInputSchema)
    .mutation(({ input }) => updateComplaintTicket(input)),

  // Ticket assignment routes
  assignTicket: publicProcedure
    .input(assignTicketInputSchema)
    .mutation(({ input }) => assignTicket(input)),

  transferTicketToTeam: publicProcedure
    .input(z.object({
      ticketId: z.number(),
      targetTeam: z.string(),
      transferredBy: z.number()
    }))
    .mutation(({ input }) => transferTicketToTeam(input.ticketId, input.targetTeam, input.transferredBy)),

  // Ticket history routes
  createTicketHistory: publicProcedure
    .input(createTicketHistoryInputSchema)
    .mutation(({ input }) => createTicketHistory(input)),

  getTicketHistory: publicProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(({ input }) => getTicketHistory(input.ticketId)),

  // Reporting and analytics routes
  generateMonthlyReport: publicProcedure
    .input(monthlyReportQuerySchema)
    .query(({ input }) => generateMonthlyReport(input)),

  getUserWorkloadStats: publicProcedure
    .input(workloadAnalysisQuerySchema)
    .query(({ input }) => getUserWorkloadStats(input)),

  getIssueTypeAnalysis: publicProcedure
    .input(z.object({
      startDate: z.coerce.date(),
      endDate: z.coerce.date()
    }))
    .query(({ input }) => getIssueTypeAnalysis(input.startDate, input.endDate)),

  getCustomerFrequencyAnalysis: publicProcedure
    .input(z.object({
      startDate: z.coerce.date(),
      endDate: z.coerce.date()
    }))
    .query(({ input }) => getCustomerFrequencyAnalysis(input.startDate, input.endDate)),

  getTeamPerformanceMetrics: publicProcedure
    .input(z.object({
      team: z.string().optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional()
    }).optional())
    .query(({ input }) => getTeamPerformanceMetrics(input?.team, input?.startDate, input?.endDate)),

  // Dashboard routes
  getDashboardMetrics: publicProcedure
    .query(() => getDashboardMetrics()),

  getUserDashboard: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUserDashboard(input.userId))
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`Helpdesk TRPC server listening at port: ${port}`);
}

start();