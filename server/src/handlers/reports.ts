import { db } from '../db';
import { usersTable, complaintTicketsTable } from '../db/schema';
import { 
  type MonthlyReportQuery, 
  type WorkloadAnalysisQuery, 
  type UserWorkloadStats,
  type IssueTypeStats,
  type CustomerFrequencyStats
} from '../schema';
import { sql, eq, and, gte, lte, count, avg, desc, asc } from 'drizzle-orm';

export const generateMonthlyReport = async (query: MonthlyReportQuery): Promise<any> => {
  try {
    const startDate = new Date(query.year, query.month - 1, 1);
    const endDate = new Date(query.year, query.month, 0); // Last day of the month

    // Build base query for monthly tickets
    let baseQuery = db.select({
      total_tickets: count(complaintTicketsTable.id),
      resolved_tickets: count(sql`CASE WHEN ${complaintTicketsTable.status} = 'Solved' THEN 1 END`),
      in_progress_tickets: count(sql`CASE WHEN ${complaintTicketsTable.status} = 'In Progress' THEN 1 END`),
      pending_tickets: count(sql`CASE WHEN ${complaintTicketsTable.status} = 'Pending' THEN 1 END`),
      cancelled_tickets: count(sql`CASE WHEN ${complaintTicketsTable.status} = 'Cancel' THEN 1 END`),
      new_tickets: count(sql`CASE WHEN ${complaintTicketsTable.status} = 'New' THEN 1 END`),
      avg_resolution_time: avg(sql`
        CASE 
          WHEN ${complaintTicketsTable.resolved_at} IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (${complaintTicketsTable.resolved_at} - ${complaintTicketsTable.created_at})) / 3600 
        END
      `)
    })
    .from(complaintTicketsTable);

    // Add conditions for date range
    const conditions = [
      gte(complaintTicketsTable.created_at, startDate),
      lte(complaintTicketsTable.created_at, endDate)
    ];

    // Add team filter if specified
    if (query.team) {
      conditions.push(eq(complaintTicketsTable.assigned_team, query.team));
    }

    const finalQuery = baseQuery.where(and(...conditions));

    const [summary] = await finalQuery.execute();

    // Get priority breakdown
    const priorityBreakdown = await db.select({
      priority: complaintTicketsTable.issue_priority,
      count: count(complaintTicketsTable.id)
    })
    .from(complaintTicketsTable)
    .where(and(...conditions))
    .groupBy(complaintTicketsTable.issue_priority)
    .execute();

    // Get category breakdown
    const categoryBreakdown = await db.select({
      category: complaintTicketsTable.customer_category,
      count: count(complaintTicketsTable.id)
    })
    .from(complaintTicketsTable)
    .where(and(...conditions))
    .groupBy(complaintTicketsTable.customer_category)
    .execute();

    return {
      period: {
        year: query.year,
        month: query.month,
        start_date: startDate,
        end_date: endDate
      },
      summary: {
        total_tickets: summary.total_tickets,
        resolved_tickets: summary.resolved_tickets,
        in_progress_tickets: summary.in_progress_tickets,
        pending_tickets: summary.pending_tickets,
        cancelled_tickets: summary.cancelled_tickets,
        new_tickets: summary.new_tickets,
        resolution_rate: summary.total_tickets > 0 ? (summary.resolved_tickets / summary.total_tickets) * 100 : 0,
        avg_resolution_time_hours: summary.avg_resolution_time ? parseFloat(summary.avg_resolution_time.toString()) : null
      },
      priority_breakdown: priorityBreakdown,
      category_breakdown: categoryBreakdown,
      team: query.team || 'All Teams'
    };
  } catch (error) {
    console.error('Monthly report generation failed:', error);
    throw error;
  }
};

export const getUserWorkloadStats = async (query: WorkloadAnalysisQuery): Promise<UserWorkloadStats[]> => {
  try {
    // Build conditions array for ticket filtering
    const ticketConditions = [
      gte(complaintTicketsTable.created_at, query.start_date),
      lte(complaintTicketsTable.created_at, query.end_date)
    ];

    // User filter
    if (query.user_id) {
      ticketConditions.push(eq(usersTable.id, query.user_id));
    }

    // Team filter
    if (query.team) {
      ticketConditions.push(eq(usersTable.role, query.team));
    }

    // Build and execute query with proper joins and conditions
    const ticketQuery = db.select()
      .from(complaintTicketsTable)
      .innerJoin(usersTable, eq(complaintTicketsTable.assigned_to, usersTable.id))
      .where(and(...ticketConditions));

    // Execute the query
    const ticketResults = await ticketQuery.execute();

    // Now aggregate the results manually
    const userStats = new Map<number, {
      user_id: number;
      username: string;
      full_name: string;
      team: string;
      total_tickets_handled: number;
      tickets_resolved: number;
      tickets_in_progress: number;
      resolution_times: number[];
    }>();

    ticketResults.forEach(result => {
      const ticket = result.complaint_tickets;
      const user = result.users;
      
      if (!userStats.has(user.id)) {
        userStats.set(user.id, {
          user_id: user.id,
          username: user.username,
          full_name: user.full_name,
          team: user.role,
          total_tickets_handled: 0,
          tickets_resolved: 0,
          tickets_in_progress: 0,
          resolution_times: []
        });
      }

      const stats = userStats.get(user.id)!;
      stats.total_tickets_handled++;
      
      if (ticket.status === 'Solved') {
        stats.tickets_resolved++;
        if (ticket.resolved_at) {
          const resolutionTime = (ticket.resolved_at.getTime() - ticket.created_at.getTime()) / (1000 * 60 * 60); // hours
          stats.resolution_times.push(resolutionTime);
        }
      }
      
      if (ticket.status === 'In Progress') {
        stats.tickets_in_progress++;
      }
    });

    // Convert to final format
    return Array.from(userStats.values())
      .map(stats => ({
        user_id: stats.user_id,
        username: stats.username,
        full_name: stats.full_name,
        team: stats.team as any,
        total_tickets_handled: stats.total_tickets_handled,
        tickets_resolved: stats.tickets_resolved,
        tickets_in_progress: stats.tickets_in_progress,
        average_resolution_time_hours: stats.resolution_times.length > 0 
          ? stats.resolution_times.reduce((sum, time) => sum + time, 0) / stats.resolution_times.length
          : null
      }))
      .sort((a, b) => b.total_tickets_handled - a.total_tickets_handled);
  } catch (error) {
    console.error('User workload stats retrieval failed:', error);
    throw error;
  }
};

export const getIssueTypeAnalysis = async (startDate: Date, endDate: Date): Promise<IssueTypeStats[]> => {
  try {
    // Get total count for percentage calculation
    const [totalResult] = await db.select({
      total: count(complaintTicketsTable.id)
    })
    .from(complaintTicketsTable)
    .where(and(
      gte(complaintTicketsTable.created_at, startDate),
      lte(complaintTicketsTable.created_at, endDate)
    ))
    .execute();

    const totalTickets = totalResult.total;

    // Analyze by customer category (as a proxy for issue type)
    const categoryStats = await db.select({
      issue_type: complaintTicketsTable.customer_category,
      count: count(complaintTicketsTable.id)
    })
    .from(complaintTicketsTable)
    .where(and(
      gte(complaintTicketsTable.created_at, startDate),
      lte(complaintTicketsTable.created_at, endDate)
    ))
    .groupBy(complaintTicketsTable.customer_category)
    .orderBy(desc(count(complaintTicketsTable.id)))
    .execute();

    // Analyze by priority level as another dimension
    const priorityStats = await db.select({
      issue_type: sql`CONCAT(${complaintTicketsTable.issue_priority}, ' Priority')`,
      count: count(complaintTicketsTable.id)
    })
    .from(complaintTicketsTable)
    .where(and(
      gte(complaintTicketsTable.created_at, startDate),
      lte(complaintTicketsTable.created_at, endDate)
    ))
    .groupBy(complaintTicketsTable.issue_priority)
    .orderBy(desc(count(complaintTicketsTable.id)))
    .execute();

    // Combine results and calculate percentages
    const allStats = [...categoryStats, ...priorityStats];

    return allStats.map(stat => ({
      issue_type: stat.issue_type as string,
      count: stat.count,
      percentage: totalTickets > 0 ? parseFloat(((stat.count / totalTickets) * 100).toFixed(2)) : 0
    }));
  } catch (error) {
    console.error('Issue type analysis failed:', error);
    throw error;
  }
};

export const getCustomerFrequencyAnalysis = async (startDate: Date, endDate: Date): Promise<CustomerFrequencyStats[]> => {
  try {
    const results = await db.select({
      customer_id: complaintTicketsTable.customer_id,
      customer_name: complaintTicketsTable.customer_name,
      complaint_count: count(complaintTicketsTable.id),
      last_complaint_date: sql<string>`MAX(${complaintTicketsTable.created_at})::text`
    })
    .from(complaintTicketsTable)
    .where(and(
      gte(complaintTicketsTable.created_at, startDate),
      lte(complaintTicketsTable.created_at, endDate)
    ))
    .groupBy(complaintTicketsTable.customer_id, complaintTicketsTable.customer_name)
    .having(sql`COUNT(${complaintTicketsTable.id}) > 1`) // Only customers with multiple complaints
    .orderBy(desc(count(complaintTicketsTable.id)))
    .execute();

    return results.map(result => ({
      customer_id: result.customer_id,
      customer_name: result.customer_name,
      complaint_count: result.complaint_count,
      last_complaint_date: new Date(result.last_complaint_date)
    }));
  } catch (error) {
    console.error('Customer frequency analysis failed:', error);
    throw error;
  }
};

export const getTeamPerformanceMetrics = async (team?: string, startDate?: Date, endDate?: Date): Promise<any> => {
  try {
    // Build conditions array first
    const conditions = [];

    // Team filter
    if (team) {
      conditions.push(eq(complaintTicketsTable.assigned_team, team as any));
    }

    // Date filters
    if (startDate) {
      conditions.push(gte(complaintTicketsTable.created_at, startDate));
    }
    if (endDate) {
      conditions.push(lte(complaintTicketsTable.created_at, endDate));
    }

    // Build query with aliases for aggregated fields
    const totalTicketsAlias = count(complaintTicketsTable.id).as('total_tickets');
    const resolvedTicketsAlias = count(sql`CASE WHEN ${complaintTicketsTable.status} = 'Solved' THEN 1 END`).as('resolved_tickets');
    const inProgressTicketsAlias = count(sql`CASE WHEN ${complaintTicketsTable.status} = 'In Progress' THEN 1 END`).as('in_progress_tickets');
    const pendingTicketsAlias = count(sql`CASE WHEN ${complaintTicketsTable.status} = 'Pending' THEN 1 END`).as('pending_tickets');
    const avgResolutionTimeAlias = avg(sql`
      CASE 
        WHEN ${complaintTicketsTable.resolved_at} IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (${complaintTicketsTable.resolved_at} - ${complaintTicketsTable.created_at})) / 3600 
      END
    `).as('avg_resolution_time');

    const baseQuery = db.select({
      team: complaintTicketsTable.assigned_team,
      total_tickets: totalTicketsAlias,
      resolved_tickets: resolvedTicketsAlias,
      in_progress_tickets: inProgressTicketsAlias,
      pending_tickets: pendingTicketsAlias,
      avg_resolution_time: avgResolutionTimeAlias
    })
    .from(complaintTicketsTable);
    
    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const results = await query
      .groupBy(complaintTicketsTable.assigned_team)
      .orderBy(asc(complaintTicketsTable.assigned_team))
      .execute();

    return {
      period: {
        start_date: startDate,
        end_date: endDate
      },
      team_metrics: results
        .filter(result => result.team !== null) // Filter out unassigned tickets
        .map(result => ({
          team: result.team,
          total_tickets: result.total_tickets,
          resolved_tickets: result.resolved_tickets,
          in_progress_tickets: result.in_progress_tickets,
          pending_tickets: result.pending_tickets,
          resolution_rate: result.total_tickets > 0 ? parseFloat(((result.resolved_tickets / result.total_tickets) * 100).toFixed(2)) : 0,
          avg_resolution_time_hours: result.avg_resolution_time ? parseFloat(result.avg_resolution_time.toString()) : null,
          efficiency_score: result.total_tickets > 0 && result.avg_resolution_time ? 
            parseFloat((result.resolved_tickets / (result.total_tickets * parseFloat(result.avg_resolution_time.toString()) / 24)).toFixed(2)) : null
        }))
    };
  } catch (error) {
    console.error('Team performance metrics retrieval failed:', error);
    throw error;
  }
};