"use client";
import {
  CheckCircle2,
  Filter,
  PauseCircle,
  Search,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { RecordViewButton } from "@/components/record-view-button";
import type { EmployeeRow } from "./employee-data";
import { EmployeesSidebar } from "./employees-sidebar";
import { activeStatus, recordText } from "@/lib/record-value";
import { bankService } from "@/services/bank.service";
import { useSessionUser } from "@/components/session-context";
import { loadAllPages } from "@/lib/paged-data";
import { ResourceCreateDialog } from "@/features/live/resource-create-dialog";

export function EmployeesPage() {
  const user = useSessionUser();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState("Danh sách nhân viên");
  const [branch, setBranch] = useState("");
  const employeesQuery = useQuery({
    queryKey: ["staff-employees", user.id],
    queryFn: () =>
      loadAllPages(bankService.employees, (row) =>
        recordText(row, ["employeeid", "employeecode"]),
      ),
  });
  const employeeRows = useMemo<EmployeeRow[]>(
    () =>
      (employeesQuery.data ?? []).map((row) => {
        const rawStatus = recordText(row, ["status"], "Chưa cập nhật");
        return {
          id: recordText(row, ["employeeid", "employeecode"]),
          branchId: recordText(row, ["branchid", "branchcode"]),
          hireDate: recordText(row, ["hiredate"], ""),
          code: recordText(row, ["employeecode", "code", "employeeid"]),
          name: recordText(row, ["fullname", "name"]),
          branch: recordText(row, ["branchname", "branchcode", "branchid"]),
          position: recordText(row, ["rolename", "position", "title"]),
          phone: recordText(row, ["phone", "phonenumber"]),
          email: recordText(row, ["email"]),
          status: activeStatus(rawStatus)
            ? "Đang làm việc"
            : rawStatus === "Inactive"
              ? "Tạm nghỉ"
              : rawStatus,
        };
      }),
    [employeesQuery.data],
  );
  const data = useMemo(
    () =>
      employeeRows.filter(
        (row) =>
          (!status ||
            (status === "Active"
              ? row.status === "Đang làm việc"
              : row.status === "Tạm nghỉ")) &&
          (!branch || row.branchId === branch) &&
          `${row.code} ${row.name} ${row.phone} ${row.email} ${row.branch} ${row.position}`
            .toLocaleLowerCase("vi")
            .includes(q.trim().toLocaleLowerCase("vi")),
      ),
    [employeeRows, q, status, branch],
  );
  const pagination = useListPagination(data, { fitViewportOnly: true });
  const branches = Array.from(
    new Map(employeeRows.map((row) => [row.branchId, row.branch])).entries(),
  );
  const reset = () => {
    setQ("");
    setStatus("");
    setBranch("");
    pagination.setPage(1);
    setTab("Danh sách nhân viên");
  };
  const value = (number: number) =>
    employeesQuery.isSuccess ? String(number) : "—";
  const activeCount = employeeRows.filter(
    (x) => x.status === "Đang làm việc",
  ).length;
  const cards = [
    [UsersRound, "Tổng nhân viên", value(employeeRows.length)],
    [UserRoundCheck, "Đang làm việc", value(activeCount)],
    [
      PauseCircle,
      "Tạm nghỉ",
      value(employeeRows.filter((row) => row.status === "Tạm nghỉ").length),
    ],
    [CheckCircle2, "Chi nhánh có nhân viên", value(branches.length)],
  ] as const;
  return (
    <div className="staff-data-page employees-page-content flex flex-col gap-2.5 text-navy">
      <section className="relative h-60 overflow-hidden rounded-xl border border-red-100">
        <Image
          src="/employees-hero.png"
          alt="Danh sách nhân viên"
          fill
          priority
          className="object-contain"
        />
      </section>
      <section className="grid grid-cols-4 gap-3">
        {cards.map(([I, l, v]) => (
          <article className="card flex items-center gap-3 p-3" key={l}>
            <span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <I size={21} />
            </span>
            <div>
              <p className="text-xs">{l}</p>
              <b className="text-2xl">{v}</b>
              <small className="block text-[9px] text-emerald-500">
                Toàn bộ dữ liệu được cấp quyền
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 justify-between px-3">
        <div className="flex h-full gap-4">
          {[
            "Danh sách nhân viên",
            "Sơ đồ tổ chức",
            "Thống kê",
            "Lịch sử thay đổi",
          ].map((x) => (
            <button
              className={
                tab === x
                  ? "border-b-2 border-coral px-2 text-xs text-coral"
                  : "px-2 text-xs"
              }
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
        <ResourceCreateDialog
          resource="employees"
          onCreated={() => void employeesQuery.refetch()}
        />
      </section>
      {tab !== "Danh sách nhân viên" ? (
        <section className="card min-h-0 flex-1 overflow-auto p-5">
          <h2 className="text-lg font-black">{tab}</h2>
          {employeesQuery.isError ? (
            <p role="alert" className="mt-3 text-red-600">
              Không thể tải dữ liệu nhân viên.
            </p>
          ) : tab === "Sơ đồ tổ chức" ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {branches.map(([id, name]) => (
                <article className="rounded-xl border p-4" key={id}>
                  <h3 className="font-bold">{name}</h3>
                  <ul className="mt-2 space-y-2 text-xs">
                    {employeeRows
                      .filter((row) => row.branchId === id)
                      .map((row) => (
                        <li key={row.id}>
                          <b>{row.name}</b>
                          <span className="ml-2 text-slate-500">
                            {row.position}
                          </span>
                        </li>
                      ))}
                  </ul>
                </article>
              ))}
              {!branches.length && (
                <p>Chưa có dữ liệu nhân sự theo chi nhánh.</p>
              )}
            </div>
          ) : tab === "Thống kê" ? (
            <div className="mt-4">
              <EmployeesSidebar
                rows={employeeRows}
                ready={employeesQuery.isSuccess}
                error={employeesQuery.isError}
                onShowAll={reset}
              />
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-3 text-sm text-slate-500">
                Tra cứu các thay đổi đã được ghi nhận trong nhật ký hoạt động.
              </p>
              <Link className="btn-secondary" href="/admin/audit-logs">
                Mở nhật ký hoạt động
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section className="grid min-h-0 flex-1 grid-cols-[1.9fr_.7fr] gap-3">
          <article
            ref={pagination.panelRef}
            className="card flex min-h-0 flex-col p-3"
          >
            <div className="grid grid-cols-[1.5fr_.7fr_.7fr_.35fr] gap-2">
              <label className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={15}
                />
                <input
                  className="h-9 w-full rounded-lg border pl-9 text-[10px]"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    pagination.setPage(1);
                  }}
                  placeholder="Tìm theo tên, mã nhân viên, chi nhánh..."
                />
              </label>
              <select
                className="text-[10px]"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  pagination.setPage(1);
                }}
                aria-label="Trạng thái nhân viên"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="Active">Đang làm việc</option>
                <option value="Inactive">Tạm nghỉ</option>
              </select>
              <select
                aria-label="Chi nhánh nhân viên"
                className="text-[10px]"
                value={branch}
                onChange={(event) => {
                  setBranch(event.target.value);
                  pagination.setPage(1);
                }}
              >
                <option value="">Tất cả chi nhánh</option>
                {branches.map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                onClick={reset}
                className="border border-coral text-[10px] text-coral"
              >
                <Filter className="inline" size={13} /> Đặt lại
              </button>
            </div>
            <div className="staff-table-scroll">
              <table className="mt-3 w-full table-fixed text-left text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Mã NV",
                      "Họ và tên",
                      "Chi nhánh",
                      "Chức vụ",
                      "Điện thoại",
                      "Trạng thái",
                      "Thao tác",
                    ].map((x) => (
                      <th className="p-2" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeesQuery.isLoading && (
                    <tr>
                      <td
                        className="p-3 text-center text-slate-500"
                        colSpan={7}
                      >
                        Đang tải dữ liệu nhân viên…
                      </td>
                    </tr>
                  )}
                  {employeesQuery.isError && (
                    <tr>
                      <td className="p-3 text-center text-red-600" colSpan={7}>
                        Không thể tải dữ liệu từ PostgreSQL.
                      </td>
                    </tr>
                  )}
                  {employeesQuery.isSuccess && !data.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-3 text-center text-slate-500"
                      >
                        Không có nhân viên phù hợp.
                      </td>
                    </tr>
                  )}
                  {employeesQuery.isSuccess &&
                    pagination.visibleItems.map((x) => (
                      <tr className="border-t" key={x.code}>
                        <td className="p-1">{x.code}</td>
                        <td className="p-1">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="grid size-6 shrink-0 place-items-center rounded-full bg-rose-50 text-coral"
                            >
                              {x.name.trim().split(/\s+/).at(-1)?.slice(0, 1)}
                            </span>
                            <b className="min-w-0 flex-1 truncate">{x.name}</b>
                          </div>
                        </td>
                        <td className="p-1">{x.branch}</td>
                        <td className="p-1">{x.position}</td>
                        <td className="p-1">{x.phone}</td>
                        <td className="p-1">
                          <span
                            className={
                              x.status === "Đang làm việc"
                                ? "rounded bg-emerald-100 px-1 text-emerald-600"
                                : "rounded bg-amber-100 px-1 text-amber-600"
                            }
                          >
                            {x.status}
                          </span>
                        </td>
                        <td className="p-1">
                          <RecordViewButton
                            record={x}
                            title="Chi tiết nhân viên"
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="nhân viên" />
          </article>
          <EmployeesSidebar
            rows={employeeRows}
            ready={employeesQuery.isSuccess}
            error={employeesQuery.isError}
            onShowAll={reset}
          />
        </section>
      )}
    </div>
  );
}
