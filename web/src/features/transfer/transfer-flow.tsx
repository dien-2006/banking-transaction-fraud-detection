"use client";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CircleAlert,
  LoaderCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  PiggyBank,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionUser } from "@/components/session-context";
import {
  useCustomerAccounts,
  useCustomerTransactions,
} from "@/features/customer/customer-queries";
import { CustomerMetric } from "@/features/customer/customer-ui";
import { ReferenceArtwork } from "@/features/customer/reference-artwork";
import { TransactionResult } from "@/components/transaction-result";
import { Modal } from "@/components/ui";
import { accountBalanceSummary } from "@/lib/account-analytics";
import {
  transferredToday,
  validateTransferDestination,
} from "@/lib/transfer-data";
import { useRecipientVerification } from "./use-recipient-verification";
import { useRecentRecipients } from "./use-recent-recipients";
import { accountKind } from "@/lib/customer-data";
import { ApiError } from "@/services/api.client";
import { money } from "@/lib/utils";
import { bankService, type TransferDestination } from "@/services/bank.service";
import type { Transaction } from "@/types";
import "./transfer-flow.css";

const steps = ["Thông tin", "Xác nhận", "OTP", "Hoàn tất"];
const number = new Intl.NumberFormat("vi-VN");

export function TransferFlow() {
  const user = useSessionUser(),
    queryClient = useQueryClient();
  const accountQuery = useCustomerAccounts();
  const history = useCustomerTransactions();
  const { recipients, remember } = useRecentRecipients(user.id);
  const [recipientDialog, setRecipientDialog] = useState(false);
  const [sourceDialog, setSourceDialog] = useState(false);
  const [resolved, setResolved] = useState<TransferDestination | null>(null);
  const attempted = useRef(false);
  const accounts = (accountQuery.data ?? [])
    .filter((x) => x.status === "Active" && x.currency === "VND")
    .map((x) => ({
      id: String(x.accountid),
      number: x.accountnumber,
      name: x.accounttypename,
      type: accountKind(x),
      balance: Number(x.balance),
      available: Number(x.availablebalance),
    }));
  const confirmedSource = useRef<(typeof accounts)[number] | null>(null);
  const [step, setStep] = useState(0),
    [result, setResult] = useState<Transaction | null>(null),
    [loading, setLoading] = useState(false),
    [otp, setOtp] = useState(""),
    [error, setError] = useState(""),
    [destinationId, setDestinationId] = useState<number | null>(null),
    [challengeId, setChallengeId] = useState(""),
    [otpDestination, setOtpDestination] = useState(""),
    [sourceId, setSourceId] = useState(""),
    [expiresAt, setExpiresAt] = useState(0),
    [remaining, setRemaining] = useState(0),
    [hidden, setHidden] = useState(false),
    [submitFailure, setSubmitFailure] = useState<unknown>(null);
  const idempotencyKey = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}`,
  );
  const authorization = useRef("");
  const [form, setForm] = useState({
    bank: "D4 Bank",
    account: "",
    customer: "",
    amount: "",
    content: "",
  });
  const amount = Number(form.amount.replace(/\D/g, "")),
    source =
      (step > 0 ? confirmedSource.current : null) ??
      accounts.find((x) => x.id === sourceId) ??
      accounts.find((x) => x.type === "Thanh toán") ??
      accounts[0],
    summary = accountBalanceSummary(accountQuery.data ?? []);
  const recipientVerification = useRecipientVerification(
    form.account,
    Number(source?.id ?? 0),
    step === 0 && accountQuery.isSuccess && !!source,
  );
  const moneyText = (value: number) =>
    hidden ? "••••••" : number.format(value);
  const chooseRecipient = (recipient: TransferDestination) => {
    update("account", recipient.accountNumber);
    update("customer", "");
    setDestinationId(null);
    setResolved(null);
    setError("");
    setRecipientDialog(false);
  };
  const update = (key: keyof typeof form, value: string) =>
    setForm((x) => ({ ...x, [key]: value }));
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const requestOtp = async (context: {
    sourceAccountId: number;
    destinationAccountId: number;
    amount: string;
    idempotencyKey: string;
    channel: "InternetBanking";
    description: string;
  }) => {
    setLoading(true);
    setError("");
    setSubmitFailure(null);
    try {
      const challenge = await bankService.requestTransferOtp(context);
      authorization.current = "";
      setChallengeId(challenge.challengeId);
      setOtpDestination(challenge.destinationMasked);
      setOtp("");
      setExpiresAt(Date.now() + challenge.expiresIn * 1000);
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể gửi OTP.");
    } finally {
      setLoading(false);
    }
  };
  const next = async () => {
    if (loading) return;
    setError("");
    if (step === 0) {
      if (
        !accountQuery.isSuccess ||
        !source ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > source.available
      ) {
        setError("Vui lòng kiểm tra tài khoản nguồn và số tiền chuyển.");
        return;
      }
      if (recipientVerification.status !== "verified") {
        setError("Vui lòng đợi xác minh tên người nhận trước khi tiếp tục.");
        return;
      }
      setLoading(true);
      try {
        const destination = validateTransferDestination(
          await bankService.resolveDestination(form.account.replace(/\s/g, "")),
          Number(source.id),
        );
        confirmedSource.current = { ...source };
        setResolved(destination);
        setDestinationId(destination.accountId);
        setForm((x) => ({
          ...x,
          customer: destination.accountName,
          bank: destination.bankName,
          account: destination.accountNumber,
        }));
        setStep(1);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Không thể kiểm tra tài khoản nhận.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!source || !destinationId) {
      setError("Thông tin tài khoản chưa hợp lệ.");
      return;
    }
    const context = {
      sourceAccountId: Number(source.id),
      destinationAccountId: destinationId,
      amount: String(amount),
      idempotencyKey: idempotencyKey.current,
      channel: "InternetBanking" as const,
      description: form.content || `Chuyển tiền đến ${form.customer}`,
    };
    if (step === 1) {
      await requestOtp(context);
      return;
    }
    if (step === 2) {
      if (otp.length !== 6) {
        setError("Vui lòng nhập đủ 6 chữ số xác nhận.");
        return;
      }
      if (!challengeId) {
        setError("Phiên OTP không tồn tại. Vui lòng quay lại để gửi mã mới.");
        return;
      }
      setLoading(true);
      setSubmitFailure(null);
      let transferSubmitted = false;
      try {
        if (!authorization.current) {
          const verified = await bankService.verifyTransferOtp({
            ...context,
            challengeId,
            code: otp,
          });
          authorization.current = verified.authorizationToken;
        }
        attempted.current = true;
        transferSubmitted = true;
        const created = await bankService.transfer({
          ...context,
          otpAuthorizationToken: authorization.current,
          description: form.content || `Chuyển tiền đến ${form.customer}`,
        });
        setResult({ ...created, customer: form.customer });
        if (created.status === "Thành công" && resolved) remember(resolved);
        setStep(3);
        void queryClient.invalidateQueries({ queryKey: ["customer", user.id] });
      } catch (caught) {
        if (transferSubmitted) setSubmitFailure(caught);
        if (caught instanceof ApiError && [400, 422].includes(caught.status)) {
          attempted.current = false;
          authorization.current = "";
          setExpiresAt(Date.now());
        }
        if (
          caught instanceof ApiError &&
          caught.status === 403 &&
          authorization.current
        ) {
          authorization.current = "";
          setExpiresAt(Date.now());
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Không thể xử lý giao dịch. Vui lòng thử lại.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }
    setStep((x) => Math.min(3, x + 1));
  };
  const resend = () => {
    if (!source || !destinationId || remaining > 0) return;
    void requestOtp({
      sourceAccountId: Number(source.id),
      destinationAccountId: destinationId,
      amount: String(amount),
      idempotencyKey: idempotencyKey.current,
      channel: "InternetBanking",
      description: form.content || `Chuyển tiền đến ${form.customer}`,
    });
  };
  return (
    <div className="transfer-page">
      <div className="transfer-page-content">
        {step === 0 && (
          <>
            <header className="customer-page-hero transfer-hero">
              <ReferenceArtwork
                region="transferHero"
                className="transfer-hero-art"
              />
              <div className="transfer-hero-copy">
                <nav aria-label="Đường dẫn">
                  <Link href="/customer">Trang chủ</Link>
                  <ChevronRight size={13} />
                  <span>Chuyển tiền</span>
                </nav>
                <h1>
                  Chuyển <span>tiền</span>
                </h1>
                <p>Chuyển tiền nhanh chóng, an toàn, mọi lúc mọi nơi.</p>
              </div>
              <p className="transfer-hero-slogan" aria-hidden="true">
                Chuyển tiền dễ dàng
                <br />
                Kết nối mọi người
                <br />
                gần hơn!
              </p>
            </header>
            <section
              className="customer-metrics transfer-stats"
              aria-label="Tổng quan tài khoản"
              data-long-values={
                Math.max(
                  number.format(summary.total).length,
                  ...summary.groups.map(
                    (group) => number.format(group.balance).length,
                  ),
                ) > 12
              }
            >
              <CustomerMetric
                label="Tổng số dư"
                value={
                  <>
                    <span className="transfer-metric-number">
                      {accountQuery.isSuccess ? moneyText(summary.total) : "—"}
                    </span>
                    <span className="transfer-metric-currency">VND</span>
                    <button
                      type="button"
                      aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"}
                      onClick={() => setHidden(!hidden)}
                    >
                      {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </>
                }
                caption={`${summary.count} tài khoản đang hoạt động`}
              />
              {summary.groups.map((group) => (
                <CustomerMetric
                  key={group.type}
                  label={`Tài khoản ${group.type.toLocaleLowerCase("vi")}`}
                  icon={
                    group.type === "Tiết kiệm"
                      ? PiggyBank
                      : group.type === "Thẻ"
                        ? CreditCard
                        : Wallet
                  }
                  value={
                    <>
                      <span className="transfer-metric-number">
                        {accountQuery.isSuccess
                          ? moneyText(group.balance)
                          : "—"}
                      </span>
                      <span className="transfer-metric-currency">VND</span>
                    </>
                  }
                  caption={`${group.count} tài khoản`}
                />
              ))}
            </section>
            <div className="transfer-workspace">
              <form
                className="transfer-form-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  void next();
                }}
              >
                <h2>Thông tin chuyển tiền</h2>
                <fieldset
                  className="transfer-form-fields"
                  disabled={loading || !accountQuery.isSuccess}
                >
                  <div className="transfer-source-row">
                    <label>
                      Tài khoản nguồn <i>*</i>
                      <button
                        type="button"
                        className="transfer-source-select"
                        aria-label="Tài khoản nguồn"
                        aria-haspopup="dialog"
                        aria-expanded={sourceDialog}
                        disabled={
                          loading || !accountQuery.isSuccess || !accounts.length
                        }
                        onClick={() => setSourceDialog(true)}
                      >
                        <CreditCard aria-hidden="true" />
                        <span>
                          {source
                            ? `${hidden ? "••••••" : source.number} · ${source.name}`
                            : "Chưa có tài khoản nguồn"}
                        </span>
                        <ChevronDown aria-hidden="true" />
                      </button>
                    </label>
                    <div className="transfer-available">
                      <i>
                        <Wallet />
                      </i>
                      <div>
                        <small>Số dư khả dụng</small>
                        <b>
                          {accountQuery.isSuccess && source
                            ? moneyText(source.available)
                            : "—"}{" "}
                          <small>VND</small>
                        </b>
                      </div>
                      <button
                        type="button"
                        aria-label={
                          hidden ? "Hiện số dư khả dụng" : "Ẩn số dư khả dụng"
                        }
                        onClick={() => setHidden(!hidden)}
                      >
                        {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>
                    </div>
                  </div>
                  <label>
                    Tài khoản nhận <i>*</i>
                    <div className="transfer-recipient-row">
                      <span className="transfer-field">
                        <UserRound />
                        <input
                          aria-label="Tài khoản nhận"
                          autoComplete="off"
                          maxLength={30}
                          required
                          value={form.account}
                          onChange={(event) => {
                            update(
                              "account",
                              event.target.value.replace(/[^a-zA-Z0-9-]/g, ""),
                            );
                            update("customer", "");
                            setDestinationId(null);
                            setResolved(null);
                          }}
                          placeholder="Nhập số tài khoản D4 Bank"
                        />
                      </span>
                      <button
                        type="button"
                        className="transfer-pick-recipient"
                        onClick={() => setRecipientDialog(true)}
                      >
                        <UserRound size={17} />
                        Chọn người nhận
                      </button>
                    </div>
                  </label>
                  <div
                    className="transfer-recipient-verification"
                    data-status={recipientVerification.status}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span className="transfer-verification-label">
                      Tên người nhận
                    </span>
                    <span className="transfer-verification-value">
                      {recipientVerification.message}
                    </span>
                    {recipientVerification.status === "checking" && (
                      <LoaderCircle
                        size={15}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {recipientVerification.status === "verified" && (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    )}
                    {recipientVerification.status === "error" && (
                      <>
                        <CircleAlert size={16} aria-hidden="true" />
                        <button
                          type="button"
                          onClick={recipientVerification.retry}
                        >
                          Thử lại
                        </button>
                      </>
                    )}
                  </div>
                  <label>
                    Ngân hàng nhận
                    <div className="transfer-field muted">
                      <Landmark />
                      <span>D4 Bank (Ngân hàng số)</span>
                    </div>
                  </label>
                  <label>
                    Số tiền <i>*</i>
                    <span className="transfer-field">
                      <CircleDollarSign aria-hidden="true" size={18} />
                      <input
                        aria-label="Số tiền"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        value={form.amount}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          update(
                            "amount",
                            digits ? number.format(Number(digits)) : "",
                          );
                        }}
                        placeholder="Nhập số tiền"
                      />
                      <b>VND</b>
                    </span>
                    {amount > (source?.available ?? 0) && (
                      <small className="transfer-field-error">
                        Số tiền vượt quá số dư khả dụng.
                      </small>
                    )}
                  </label>
                  <label>
                    Nội dung chuyển khoản
                    <span className="transfer-field">
                      <input
                        aria-label="Nội dung chuyển khoản"
                        maxLength={100}
                        value={form.content}
                        onChange={(event) =>
                          update("content", event.target.value)
                        }
                        placeholder="Nhập nội dung chuyển khoản (tối đa 100 ký tự)"
                      />
                    </span>
                    <small className="transfer-counter">
                      {form.content.length}/100
                    </small>
                  </label>
                </fieldset>
                <div className="transfer-form-bottom">
                  <div className="transfer-safety">
                    <ShieldCheck />
                    <p>
                      Giao dịch được kiểm tra bảo mật và đánh giá rủi ro trước
                      khi thực hiện.
                      <small>
                        Vui lòng kiểm tra thông tin người nhận trước khi xác
                        nhận.
                      </small>
                    </p>
                  </div>
                  {error && (
                    <p className="transfer-error" role="alert">
                      {error}
                    </p>
                  )}
                  {accountQuery.isPending && (
                    <p className="transfer-note" aria-busy="true">
                      Đang tải tài khoản nguồn…
                    </p>
                  )}
                  {accountQuery.isError && (
                    <p className="transfer-error" role="alert">
                      Không thể tải tài khoản nguồn.{" "}
                      <button
                        type="button"
                        onClick={() => void accountQuery.refetch()}
                      >
                        Thử lại
                      </button>
                    </p>
                  )}
                  {accountQuery.isSuccess && !accounts.length && (
                    <p className="transfer-note">
                      Bạn chưa có tài khoản VND đang hoạt động để chuyển tiền.
                    </p>
                  )}
                  <button
                    type="submit"
                    className="transfer-continue"
                    disabled={
                      loading ||
                      !accountQuery.isSuccess ||
                      !source ||
                      !form.account ||
                      recipientVerification.status !== "verified" ||
                      !Number.isSafeInteger(amount) ||
                      amount <= 0 ||
                      amount > source.available
                    }
                  >
                    {loading ? "Đang kiểm tra…" : "Tiếp tục"}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </form>
              <aside className="transfer-side">
                <section className="transfer-source-panel">
                  <header>
                    <h2>Tài khoản nguồn</h2>
                    <button type="button" onClick={() => setSourceDialog(true)}>
                      Xem tất cả <ArrowRight size={14} />
                    </button>
                  </header>
                  {accounts.length ? (
                    accounts.slice(0, 2).map((account) => (
                      <button
                        type="button"
                        disabled={loading}
                        aria-pressed={source?.id === account.id}
                        className="transfer-side-account"
                        key={account.id}
                        onClick={() => setSourceId(account.id)}
                      >
                        <i>
                          {account.type === "Tiết kiệm" ? (
                            <PiggyBank />
                          ) : (
                            <CreditCard />
                          )}
                        </i>
                        <span>
                          <b>{hidden ? "••••••" : account.number}</b>
                          <small>{account.name}</small>
                          <strong>{moneyText(account.balance)} VND</strong>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <p className="transfer-note">
                      {accountQuery.isPending
                        ? "Đang tải tài khoản…"
                        : accountQuery.isError
                          ? "Không thể tải tài khoản."
                          : "Chưa có tài khoản nguồn."}
                    </p>
                  )}
                </section>
                <section className="transfer-recipients-panel">
                  <header>
                    <h2>Người nhận gần đây</h2>
                    <button
                      type="button"
                      onClick={() => setRecipientDialog(true)}
                    >
                      Xem tất cả <ArrowRight size={14} />
                    </button>
                  </header>
                  {recipients.length ? (
                    recipients.slice(0, 4).map((recipient) => (
                      <button
                        type="button"
                        className="transfer-recent-recipient"
                        key={recipient.accountId}
                        disabled={loading}
                        onClick={() => chooseRecipient(recipient)}
                      >
                        <i>
                          {recipient.accountName
                            .trim()
                            .split(/\s+/)
                            .slice(-2)
                            .map((part) => part[0])
                            .join("")}
                        </i>
                        <span>
                          <b>{recipient.accountName}</b>
                          <small>{recipient.bankName}</small>
                          <small>
                            {hidden ? "••••••" : recipient.accountNumber}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <div className="transfer-no-recipients">
                      <UserRound />
                      <p>Chưa có người nhận gần đây.</p>
                      <small>
                        Người nhận được lưu trong phiên này sau khi chuyển tiền
                        thành công.
                      </small>
                    </div>
                  )}
                </section>
                <section className="transfer-limit-panel">
                  <header>
                    <h2>Hạn mức giao dịch</h2>
                  </header>
                  <div className="transfer-limit-summary">
                    <i>
                      <ShieldCheck size={32} />
                      <small>
                        Chưa cập nhật
                        <br />
                        hạn mức ngày
                      </small>
                    </i>
                    <div>
                      <small>Đã chuyển hôm nay</small>
                      <b>
                        {history.isSuccess && source
                          ? moneyText(
                              transferredToday(history.data, Number(source.id)),
                            )
                          : "—"}{" "}
                        <small>VND</small>
                      </b>
                      <span>Theo tài khoản nguồn</span>
                    </div>
                  </div>
                  <p className="transfer-note">
                    Hạn mức chuyển tiền chưa được cung cấp. Vui lòng liên hệ D4
                    Bank để kiểm tra.
                  </p>
                </section>
              </aside>
            </div>
          </>
        )}
        {step > 0 && step < 3 && (
          <section className="transfer-step-shell">
            <div className="transfer-steps">
              {steps.map((label, i) => (
                <div className={i <= step ? "active" : ""} key={label}>
                  <span>{i < step ? <Check /> : i + 1}</span>
                  <b>{label}</b>
                </div>
              ))}
            </div>
            {step === 1 && (
              <article className="transfer-confirm">
                <h2>Xác nhận giao dịch</h2>
                <p>Kiểm tra kỹ thông tin trước khi tiếp tục.</p>
                <div>
                  {[
                    ["Từ tài khoản", source?.number ?? ""],
                    ["Người nhận", form.customer],
                    ["Số tài khoản", form.account],
                    ["Ngân hàng", form.bank],
                    ["Số tiền", money.format(amount)],
                    ["Phí giao dịch", "0 ₫"],
                    ["Nội dung", form.content || "Chuyển tiền"],
                  ].map(([a, b]) => (
                    <p key={a}>
                      <span>{a}</span>
                      <b>{b}</b>
                    </p>
                  ))}
                </div>
              </article>
            )}
            {step === 2 && (
              <article className="transfer-otp">
                <ShieldCheck />
                <h2>Xác nhận giao dịch</h2>
                <p>
                  Yêu cầu gửi mã tới email {otpDestination || "đã đăng ký"} đã
                  được tiếp nhận. Nhập 6 chữ số khi email đến để hoàn tất yêu cầu
                  chuyển tiền. Nếu chưa nhận được, kiểm tra thư rác hoặc gửi lại mã.
                </p>
                <input
                  aria-label="Mã xác nhận gồm 6 chữ số"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <small>
                  {remaining > 0
                    ? `Mã còn hiệu lực ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}. Tối đa 5 lần nhập.`
                    : "Mã đã hết hạn."}
                </small>
                <button
                  className="btn-secondary mx-auto mt-4"
                  disabled={loading || remaining > 0}
                  onClick={resend}
                >
                  Gửi lại mã OTP
                </button>
              </article>
            )}
            {!!submitFailure && (
              <TransactionResult
                error={submitFailure}
                operation="Chuyển tiền"
                amount={money.format(amount)}
                details={[
                  ["Mã yêu cầu", idempotencyKey.current],
                  ["Tài khoản nguồn", source?.number ?? "—"],
                  ["Người nhận", form.customer],
                  ["Tài khoản nhận", form.account],
                ]}
              />
            )}
            {error && !submitFailure && (
              <p className="transfer-error" role="alert">
                {error}
              </p>
            )}
            {error && attempted.current && (
              <p className="transfer-note">
                Yêu cầu đã được gửi. Khi thử lại, hệ thống giữ nguyên thông tin
                và mã giao dịch.{" "}
                <Link className="underline" href="/customer/transactions">
                  Xem lịch sử để kiểm tra trạng thái
                </Link>
                .
              </p>
            )}
            <footer className="transfer-step-actions">
              <button
                className="btn-secondary"
                disabled={loading || attempted.current}
                onClick={() => setStep((x) => Math.max(0, x - 1))}
              >
                <ChevronLeft />
                Quay lại
              </button>
              <button
                className="btn-primary"
                disabled={
                  loading ||
                  (step === 2 &&
                    (otp.length !== 6 ||
                      (remaining <= 0 && !authorization.current)))
                }
                onClick={next}
              >
                {loading
                  ? "Đang xử lý..."
                  : step === 2
                    ? "Xác nhận chuyển tiền"
                    : "Tiếp tục"}
                <ChevronRight />
              </button>
            </footer>
          </section>
        )}
        {step === 3 && result && (
          <TransactionResult
            status={result.status}
            operation="Chuyển tiền"
            amount={money.format(result.amount)}
            reference={result.id}
            time={result.time}
            details={[
              ["Từ tài khoản", source?.number ?? "—"],
              ["Người nhận", result.customer],
              ["Tài khoản nhận", form.account],
              ["Ngân hàng", form.bank],
              ["Nội dung", form.content || "Chuyển tiền"],
            ]}
            historyHref="/customer/transactions"
          />
        )}
        <Modal
          open={recipientDialog}
          onOpenChange={setRecipientDialog}
          title="Chọn người nhận"
          description="Người nhận của các lần chuyển tiền thành công trong phiên này. Thông tin sẽ được xác minh lại trước khi chuyển."
        >
          {recipients.length ? (
            <div className="transfer-dialog-list">
              {recipients.map((recipient) => (
                <button
                  type="button"
                  key={recipient.accountId}
                  onClick={() => chooseRecipient(recipient)}
                >
                  <UserRound size={20} />
                  <span>
                    <b>{recipient.accountName}</b>
                    <small>
                      {hidden ? "••••••" : recipient.accountNumber} ·{" "}
                      {recipient.bankName}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <p className="transfer-note">
              Chưa có người nhận đã lưu. Hãy nhập số tài khoản người nhận vào
              biểu mẫu.
            </p>
          )}
        </Modal>
        <Modal
          open={sourceDialog}
          onOpenChange={setSourceDialog}
          title="Chọn tài khoản nguồn"
          description="Chỉ hiển thị tài khoản VND đang hoạt động của bạn."
        >
          <div className="transfer-dialog-list">
            {accounts.map((account) => (
              <button
                type="button"
                key={account.id}
                aria-pressed={source?.id === account.id}
                onClick={() => {
                  setSourceId(account.id);
                  setSourceDialog(false);
                }}
              >
                <Wallet size={20} />
                <span>
                  <b>{hidden ? "••••••" : account.number}</b>
                  <small>
                    {account.name} · Khả dụng {moneyText(account.available)} VND
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {!accounts.length && (
              <p className="transfer-note">Chưa có tài khoản nguồn.</p>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
}
