-- 1. Tao bang Khach Hang
CREATE TABLE IF NOT EXISTS KhachHang (
    MaKH SERIAL PRIMARY KEY,
    HoTen VARCHAR(100) NOT NULL,
    Email VARCHAR(100) UNIQUE,
    SDT VARCHAR(20),
    TrangThaiKhoa BOOLEAN DEFAULT FALSE,
    NgayTao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tao bang Tai Khoan
CREATE TABLE IF NOT EXISTS TaiKhoan (
    MaTK VARCHAR(20) PRIMARY KEY,
    MaKH INT REFERENCES KhachHang(MaKH),
    SoDu NUMERIC(15, 2) NOT NULL CHECK (SoDu >= 0),
    LoaiTien VARCHAR(5) DEFAULT 'VND',
    NgayMo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tao bang Giao Dich
CREATE TABLE IF NOT EXISTS GiaoDich (
    MaGD SERIAL PRIMARY KEY,
    MaTKGui VARCHAR(20) REFERENCES TaiKhoan(MaTK),
    MaTKNhan VARCHAR(20) REFERENCES TaiKhoan(MaTK),
    SoTien NUMERIC(15, 2) NOT NULL CHECK (SoTien > 0),
    ThoiGian TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ViTri VARCHAR(100),
    TrangThai VARCHAR(20) DEFAULT 'SUCCESS'
);

-- 4. Tao bang Canh Bao Gian Lan
CREATE TABLE IF NOT EXISTS CanhBaoGianLan (
    MaCanhBao SERIAL PRIMARY KEY,
    MaGD INT REFERENCES GiaoDich(MaGD),
    LyDoCanhBao TEXT,
    DiemRuiRo INT,
    ThoiGianCanhBao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Composite Index
CREATE INDEX IF NOT EXISTS idx_giaodich_tk_thoigian ON GiaoDich(MaTKGui, ThoiGian DESC);

-- 6. Trigger kiem tra gian lan
CREATE OR REPLACE FUNCTION fn_KiemTraGianLan()
RETURNS TRIGGER AS $$
DECLARE
    v_RecentTxCount INT;
    v_RiskScore INT := 0;
    v_Reason TEXT := '';
BEGIN
    SELECT COUNT(*) INTO v_RecentTxCount
    FROM GiaoDich
    WHERE MaTKGui = NEW.MaTKGui 
      AND ThoiGian >= (NEW.ThoiGian - INTERVAL '1 minute');

    IF v_RecentTxCount >= 3 THEN
        v_RiskScore := v_RiskScore + 50;
        v_Reason := v_Reason || '[Spam giao dich lien tuc] ';
    END IF;

    IF NEW.SoTien >= 20000000 THEN
        v_RiskScore := v_RiskScore + 40;
        v_Reason := v_Reason || '[So tien dot bien >= 20tr] ';
    END IF;

    IF v_RiskScore >= 50 THEN
        NEW.TrangThai := 'BLOCKED';
        INSERT INTO CanhBaoGianLan (MaGD, LyDoCanhBao, DiemRuiRo, ThoiGianCanhBao)
        VALUES (NEW.MaGD, v_Reason, v_RiskScore, CURRENT_TIMESTAMP);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_DetectFraud ON GiaoDich;
CREATE TRIGGER trg_DetectFraud
BEFORE INSERT ON GiaoDich
FOR EACH ROW
EXECUTE FUNCTION fn_KiemTraGianLan();

-- 7. Du lieu mau
INSERT INTO KhachHang (HoTen, Email, SDT) VALUES 
('Nguyen Van A', 'nguyenvana@gmail.com', '0901234567'),
('Tran Thi B', 'tranthib@gmail.com', '0912345678')
ON CONFLICT DO NOTHING;

INSERT INTO TaiKhoan (MaTK, MaKH, SoDu) VALUES 
('TK1001', 1, 50000000.00),
('TK1002', 2, 20000000.00)
ON CONFLICT DO NOTHING;
