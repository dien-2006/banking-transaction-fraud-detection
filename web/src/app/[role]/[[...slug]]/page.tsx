import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { isRole } from "@/config/navigation";
import { AboutPage } from "@/features/about/about-page";
import { NewsPage } from "@/features/news/news-page";
import { BranchesPageFixed } from "@/features/branches/branches-page-fixed";
import { EmployeesPage } from "@/features/employees/employees-page";
import { CustomersPage } from "@/features/customers/customers-page";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { TransactionsPage } from "@/features/transactions/transactions-page";
import { LoansPage } from "@/features/loans/loans-page";
import { CardsPage } from "@/features/cards/cards-page";
import { FraudPage } from "@/features/fraud/fraud-page";
import { InsightsPage } from "@/features/insights/insights-page";
import { AuditLogsPage } from "@/features/audit-logs/audit-logs-page";
import { BranchReports } from "@/features/employee/branch-reports";
import { EmployeeWorkspace } from "@/features/employee/employee-workspace";
import { AdminOverview } from "@/features/dashboard/admin-overview";
import { TransferFlow } from "@/features/transfer/transfer-flow";
import { CustomerHome } from "@/features/customer/customer-home";
import { CustomerNotifications } from "@/features/customer/customer-notifications";
import { CustomerProfile } from "@/features/customer/customer-profile";
import { CustomerAccounts } from "@/features/customer/customer-accounts";
import { CustomerTransactions } from "@/features/customer/customer-transactions";
import { CustomerLoans } from "@/features/customer/customer-loans";
import { CustomerCards } from "@/features/customer/customer-cards";
import { StaffProfilePage } from "@/features/live/staff-profile-page";

export default async function RolePage({
  params,
}: {
  params: Promise<{ role: string; slug?: string[] }>;
}) {
  const { role: rawRole, slug } = await params;
  if (slug && slug.length > 1) notFound();
  if (!isRole(rawRole)) notFound();
  const page = slug?.[0];
  if (!page)
    return (
      <DashboardShell role={rawRole}>
        {rawRole === "customer" ? (
          <CustomerHome />
        ) : (
          <AdminOverview role={rawRole} />
        )}
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "accounts")
    return (
      <DashboardShell role={rawRole}>
        <CustomerAccounts />
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "transfer")
    return (
      <DashboardShell role={rawRole}>
        <TransferFlow />
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "transactions")
    return (
      <DashboardShell role={rawRole}>
        <CustomerTransactions />
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "loans")
    return (
      <DashboardShell role={rawRole}>
        <CustomerLoans />
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "cards")
    return (
      <DashboardShell role={rawRole}>
        <CustomerCards />
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "notifications")
    return (
      <DashboardShell role={rawRole}>
        <CustomerNotifications />
      </DashboardShell>
    );
  if (rawRole === "customer" && page === "profile")
    return (
      <DashboardShell role={rawRole}>
        <CustomerProfile />
      </DashboardShell>
    );
  if (rawRole !== "customer" && page === "profile")
    return (
      <DashboardShell role={rawRole}>
        <StaffProfilePage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "branches")
    return (
      <DashboardShell role={rawRole}>
        <BranchesPageFixed />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "employees")
    return (
      <DashboardShell role={rawRole}>
        <EmployeesPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "customers")
    return (
      <DashboardShell role={rawRole}>
        <CustomersPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "accounts")
    return (
      <DashboardShell role={rawRole}>
        <AccountsPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "transactions")
    return (
      <DashboardShell role={rawRole}>
        <TransactionsPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "loans")
    return (
      <DashboardShell role={rawRole}>
        <LoansPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "cards")
    return (
      <DashboardShell role={rawRole}>
        <CardsPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "fraud")
    return (
      <DashboardShell role={rawRole}>
        <FraudPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "insights")
    return (
      <DashboardShell role={rawRole}>
        <InsightsPage />
      </DashboardShell>
    );
  if (rawRole === "admin" && page === "audit-logs")
    return (
      <DashboardShell role={rawRole}>
        <AuditLogsPage />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "customers")
    return (
      <DashboardShell role={rawRole}>
        <CustomersPage />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "accounts")
    return (
      <DashboardShell role={rawRole}>
        <AccountsPage />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "transactions")
    return (
      <DashboardShell role={rawRole}>
        <TransactionsPage />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "loans")
    return (
      <DashboardShell role={rawRole}>
        <LoansPage />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "cards")
    return (
      <DashboardShell role={rawRole}>
        <CardsPage />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "fraud")
    return (
      <DashboardShell role={rawRole}>
        <FraudPage role="employee" />
      </DashboardShell>
    );
  if (rawRole === "employee" && page === "reports")
    return (
      <DashboardShell role={rawRole}>
        <BranchReports />
      </DashboardShell>
    );
  if (rawRole !== "customer" && page === "notifications")
    return (
      <DashboardShell role={rawRole}>
        <EmployeeWorkspace />
      </DashboardShell>
    );
  if (page === "about")
    return (
      <DashboardShell role={rawRole}>
        <AboutPage role={rawRole} />
      </DashboardShell>
    );
  if (page === "news")
    return (
      <DashboardShell role={rawRole}>
        <NewsPage />
      </DashboardShell>
    );
  notFound();
}
