"use client";

import { Camera, Download, QrCode, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type { ApiAccount } from "@/services/bank.service";
import { accountNumberFromQr } from "@/lib/account-qr";
import { accountQrImages } from "@/lib/account-qr-image";
import { Modal } from "./ui";
import { Brand } from "./brand";
import "./payment-qr.css";

function ReceivingQr({ account, owner }: { account: ApiAccount; owner: string }) {
  const [image, setImage] = useState("");
  const [card, setCard] = useState("");
  const bankMark = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    const urls: string[] = [];
    setImage(""); setCard(""); setError("");
    const svg = bankMark.current?.querySelector("svg")?.cloneNode(true) as SVGSVGElement | undefined;
    if (!svg) { setError("Không thể tải logo ngân hàng. Vui lòng thử lại."); return; }
    svg.setAttribute("width", "110"); svg.setAttribute("height", "130");
    accountQrImages(account.accountnumber, owner, new XMLSerializer().serializeToString(svg)).then(images => {
      if (!current) return;
      const qrUrl = URL.createObjectURL(images.qr), cardUrl = URL.createObjectURL(images.card);
      urls.push(qrUrl, cardUrl);
      setImage(qrUrl); setCard(cardUrl);
    }).catch(() => { if (current) setError("Không thể tạo QR. Vui lòng thử lại."); });
    return () => { current = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [account.accountnumber, owner, attempt]);
  return <div className="receiving-qr">
    <div className="receiving-qr-identity">
      <div className="receiving-qr-bank" ref={bankMark}><Brand /></div>
      <strong title={owner}>{owner}</strong>
      <span className="receiving-qr-number">{account.accountnumber}</span>
    </div>
    <div className="receiving-qr-image">
      {/* Local generated PNG; no remote image service or account data upload. */}
      {image ? <img src={image} alt={`Mã QR nhận tiền tài khoản ${account.accountnumber}`} width={260} height={260} />
        : error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button></p>
          : <p role="status">Đang tạo mã QR…</p>}
    </div>
    <p>Quét mã bằng D4 Bank để chuyển tiền.</p>
    <a className="btn-primary" href={card || undefined} download={`D4Bank-QR-${account.accountnumber}.png`}
      aria-disabled={!card} onClick={event => { if (!card) event.preventDefault(); }}><Download size={16} />Tải ảnh QR</a>
  </div>;
}

export function AccountQrDialog({account,owner,hidden=false,onOpenChange}:{account:ApiAccount|null;owner:string;hidden?:boolean;onOpenChange:(open:boolean)=>void}) {
  const eligible=!!account&&!hidden&&account.status==='Active'&&account.currency==='VND'&&account.accountcategory==='CUSTOMER';
  return <Modal open={eligible} onOpenChange={onOpenChange} title="QR nhận tiền" description="Nhận tiền trong D4 Bank." className="receiving-qr-dialog">
    {eligible&&<ReceivingQr account={account} owner={owner}/>}
  </Modal>;
}

export function AccountQrButton({ account, owner, hidden = false, onOpen }: { account: ApiAccount; owner: string; hidden?: boolean; onOpen?:(account:ApiAccount)=>void }) {
  const [open, setOpen] = useState(false);
  if (account.currency !== "VND" || account.accountcategory !== "CUSTOMER") return null;
  const disabled = hidden || account.status !== "Active";
  return <>
    <button type="button" className="customer-account-view account-qr-trigger" disabled={disabled}
      aria-label={hidden ? "Mã QR nhận tiền" : `Mã QR nhận tiền tài khoản ${account.accountnumber}`}
      title={hidden ? "Hiện thông tin tài khoản để xem QR" : disabled ? "Tài khoản chưa sẵn sàng nhận tiền" : "Mã QR nhận tiền"}
      onClick={() => onOpen ? onOpen(account) : setOpen(true)}><QrCode size={14} />QR</button>
    {!onOpen&&<AccountQrDialog account={open?account:null} owner={owner} hidden={hidden} onOpenChange={setOpen}/>}
  </>;
}

async function createQrReader() {
  const [{ BrowserQRCodeReader }, library] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  return {
    reader: new BrowserQRCodeReader(new Map([[library.DecodeHintType.TRY_HARDER, true]]), {
      delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 500, tryPlayVideoTimeout: 10000,
    }),
    expectedMiss: (error: unknown) => error instanceof library.NotFoundException
      || error instanceof library.ChecksumException || error instanceof library.FormatException,
  };
}

function QrScanner({ onRead }: { onRead: (accountNumber: string) => void }) {
  const [error, setError] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<IScannerControls | null>(null);
  const stop = () => {
    generation.current++;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = null;
    controls.current?.stop(); controls.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) { setCamera(false); setBusy(false); setHint(""); }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      if (hintTimer.current) clearTimeout(hintTimer.current);
      controls.current?.stop(); controls.current = null;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    };
  }, []);
  const accept = (text: string) => {
    try {
      const account = accountNumberFromQr(text);
      stop(); onRead(account);
    } catch (caught) {
      stop(); setError(caught instanceof Error ? caught.message : "Mã QR không hợp lệ.");
    }
  };
  const start = async (deviceId = cameraId) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera cần kết nối HTTPS hoặc localhost. Bạn có thể chọn ảnh QR thay thế."); return;
    }
    stop(); setError(""); setBusy(true); setCamera(true);
    const version = generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
        width: { ideal: 1920 }, height: { ideal: 1080 },
      }, audio: false });
      if (!mounted.current || version !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const track = media.getVideoTracks()[0];
      try {
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
        if (capabilities?.focusMode?.includes("continuous")) {
          const focus: MediaTrackConstraintSet & { focusMode: string } = { focusMode: "continuous" };
          await track.applyConstraints({ advanced: [focus] });
        }
      } catch {
        if (mounted.current && version === generation.current) setHint("Giữ camera ổn định để lấy nét vào mã QR.");
      }
      if (!mounted.current || version !== generation.current) return;
      // Camera enumeration is optional; capture can work when listing is unavailable.
      const available = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const { reader, expectedMiss } = await createQrReader();
      if (!mounted.current || version !== generation.current || !video.current) return;
      setDevices(available.filter(device => device.kind === "videoinput"));
      setCameraId(track?.getSettings().deviceId || deviceId);
      const scanner = await reader.decodeFromStream(media, video.current, (result, scanError) => {
        if (result && mounted.current && version === generation.current) accept(result.getText());
        else if (scanError && !expectedMiss(scanError) && mounted.current && version === generation.current) {
          stop(); setError("Bộ đọc QR bị gián đoạn. Hãy mở lại camera hoặc chọn ảnh QR.");
        }
      });
      if (!mounted.current || version !== generation.current) { scanner.stop(); return; }
      controls.current = scanner;
      setBusy(false);
      hintTimer.current = setTimeout(() => {
        if (mounted.current && version === generation.current) {
          setHint("Chưa nhận được QR. Đưa mã gần hơn, giữ đủ bốn góc rõ nét hoặc đổi camera. Bạn cũng có thể chọn ảnh QR.");
        }
      }, 8000);
    } catch (caught) {
      if (mounted.current && version === generation.current) {
        stop();
        setError(caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Bạn chưa cho phép dùng camera. Hãy cấp quyền hoặc chọn ảnh QR."
          : "Không mở được camera. Hãy kiểm tra thiết bị hoặc chọn ảnh QR.");
      }
    }
  };
  const readFile = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Chọn ảnh PNG, JPG hoặc WebP không quá 10 MB."); return;
    }
    stop(); setError(""); setBusy(true);
    const version = generation.current;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth * image.naturalHeight > 16000000) throw new Error("Ảnh quá lớn.");
      const { reader } = await createQrReader();
      if (!mounted.current || version !== generation.current) return;
      const result = await reader.decodeFromImageElement(image);
      if (mounted.current && version === generation.current) accept(result.getText());
    } catch {
      if (mounted.current && version === generation.current) setError("Không đọc được QR trong ảnh. Chọn ảnh rõ nét, đầy đủ mã QR.");
    } finally {
      URL.revokeObjectURL(url);
      if (mounted.current && version === generation.current) setBusy(false);
    }
  };
  return <div className="payment-qr-scanner">
    <p>Quét QR nhận tiền D4 Bank. Tên người nhận sẽ được xác minh lại trước khi chuyển.</p>
    {devices.length > 1 && <label className="payment-qr-camera">Camera
      <select className="field" aria-label="Chọn camera" value={cameraId} disabled={busy}
        onChange={event => { const id = event.target.value; setCameraId(id); if (camera) void start(id); }}>
        <option value="">Tự động, ưu tiên camera sau</option>
        {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
      </select>
    </label>}
    <div className="payment-qr-video" hidden={!camera}>
      <video ref={video} autoPlay muted playsInline hidden={!camera} aria-label="Camera quét QR" />
      <span className="payment-qr-frame" aria-hidden="true" />
    </div>
    {camera && <p role="status">{busy ? "Đang mở camera…" : "Giữ mã QR rõ nét, đủ bốn góc trong khung hình."}</p>}
    {hint && <p className="payment-qr-hint" role="status">{hint}</p>}
    <div className="payment-qr-actions">
      <button type="button" className="btn-secondary" onClick={camera ? stop : () => void start()} disabled={busy && !camera}>
        <Camera size={17} />{camera ? "Dừng camera" : "Mở camera"}
      </button>
      <label className="btn-primary payment-qr-file"><Upload size={17} />{busy && !camera ? "Đang đọc ảnh…" : "Chọn ảnh QR"}
        <input type="file" aria-label="Chọn ảnh QR" accept="image/png,image/jpeg,image/webp" disabled={busy || camera}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readFile(file); }} />
      </label>
    </div>
    {error && <p className="payment-qr-error" role="alert">{error}</p>}
  </div>;
}

export function ScanTransferQrButton({ onRead }: { onRead: (accountNumber: string) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="transfer-pick-recipient" onClick={() => setOpen(true)}><QrCode size={17} />Quét QR</button>
    <Modal open={open} onOpenChange={setOpen} title="Quét QR chuyển tiền" description="Dùng camera hoặc chọn ảnh QR từ thiết bị.">
      {open && <QrScanner onRead={account => { onRead(account); setOpen(false); }} />}
    </Modal>
  </>;
}
