"use client";

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Cpu, Gift, Landmark, Leaf, Smartphone, WalletCards, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import "./news-page.css";

const categories = ["Tất cả", "Tin D4 Bank", "Sản phẩm & Dịch vụ", "Ngân hàng số", "Thị trường tài chính", "Công nghệ", "Khuyến mãi", "Trách nhiệm xã hội"];

type NewsItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  category: string;
  image?: string;
  icon?: LucideIcon;
};

// Editorial demo content only. Counts, filters and previews share this collection.
const newsItems: NewsItem[] = [
  { id: "danang", title: "D4 Bank khai trương chi nhánh mới tại Đà Nẵng", description: "Tiếp tục mở rộng mạng lưới, mang đến dịch vụ tài chính hiện đại, thuận tiện và an toàn hơn cho khách hàng miền Trung.", date: "12/09/2024", category: "Tin D4 Bank", image: "/branch-da-nang.png" },
  { id: "qr", title: "Ra mắt tính năng chuyển tiền bằng QR nâng cao", description: "Giới thiệu trải nghiệm chuyển tiền bằng mã QR trong nội dung mô phỏng D4 Bank, giúp người dùng tìm hiểu cách kiểm tra thông tin trước khi xác nhận giao dịch.", date: "10/09/2024", category: "Ngân hàng số", icon: Smartphone },
  { id: "offers", title: "Ưu đãi đặc biệt dành cho khách hàng mới", description: "Bài viết minh họa cách giới thiệu chương trình ưu đãi dành cho khách hàng mới. Nội dung demo không phải chương trình ưu đãi đang được áp dụng.", date: "08/09/2024", category: "Khuyến mãi", icon: Gift },
  { id: "advice", title: "D4 Bank triển khai dịch vụ tư vấn tài chính cá nhân", description: "Dịch vụ mới giúp khách hàng xây dựng kế hoạch tài chính phù hợp với mục tiêu dài hạn, đảm bảo an toàn và hiệu quả.", date: "05/09/2024", category: "Tin D4 Bank", image: "/branch-head-office.png" },
  { id: "ai", title: "Ứng dụng AI trong phát hiện giao dịch bất thường", description: "D4 Bank tiếp tục đầu tư công nghệ AI nhằm nâng cao khả năng bảo mật và phòng chống gian lận trong giao dịch.", date: "03/09/2024", category: "Công nghệ", icon: Cpu },
  { id: "community", title: "D4 Bank đồng hành cùng cộng đồng hướng đến phát triển bền vững", description: "Nhiều hoạt động an sinh xã hội được triển khai trong năm 2024, tập trung vào giáo dục, môi trường và hỗ trợ doanh nghiệp địa phương.", date: "28/08/2024", category: "Trách nhiệm xã hội", icon: Leaf },
  { id: "cards", title: "Giới thiệu thẻ tín dụng D4 Bank – Linh hoạt, nhiều ưu đãi", description: "Thẻ tín dụng mới với nhiều ưu đãi hoàn tiền và đặc quyền dành riêng cho khách hàng thân thiết.", date: "25/08/2024", category: "Sản phẩm & Dịch vụ", icon: WalletCards },
];
const headline = newsItems[0];
const teasers = newsItems.filter(item => item.id === "ai" || item.id === "community");
const featured = ["danang", "qr", "offers", "ai", "community"].map(id => newsItems.find(item => item.id === id)!);
const categoryIcons: Record<string, LucideIcon> = {
  "Tin D4 Bank": Landmark, "Công nghệ": Cpu, "Sản phẩm & Dịch vụ": WalletCards,
  "Khuyến mãi": Gift, "Ngân hàng số": Smartphone, "Trách nhiệm xã hội": Leaf,
  "Thị trường tài chính": Landmark,
};

function NewsThumb({ item }: { item: NewsItem }) {
  const Icon = item.icon ?? Landmark;
  return item.image
    ? <span className="news-thumb"><Image alt="" className="object-cover" fill sizes="(min-width: 768px) 100px, 64px" src={item.image}/></span>
    : <span className="news-thumb news-thumb-icon"><Icon aria-hidden="true"/></span>;
}

export function NewsPage() {
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);
  const rowsRef = useRef<HTMLDivElement>(null);
  const filteredNews = activeCategory === "Tất cả" ? newsItems : newsItems.filter(item => item.category === activeCategory);
  const totalPages = Math.max(1, Math.ceil(filteredNews.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleNews = filteredNews.slice((safePage - 1) * pageSize, safePage * pageSize);
  const first = filteredNews.length ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(safePage * pageSize, filteredNews.length);

  useEffect(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    const measure = () => {
      const height = parseFloat(getComputedStyle(rows).getPropertyValue("--news-row-height")) || 76;
      setPageSize(Math.max(1, Math.floor(rows.clientHeight / height)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(rows);
    measure();
    return () => observer.disconnect();
  }, []);

  const chooseCategory = (category: string) => {
    setActiveCategory(category);
    setPage(1);
  };

  return <div className="news-page-content">
    <section className="news-hero">
      <div className="news-hero-copy"><p>D4 BANK <span>Nội dung demo</span></p><h1>Cập nhật tin tức</h1><span>Câu chuyện, sản phẩm và hoạt động của D4 Bank.</span></div>
      <div className="news-hero-art"><Image alt="" className="object-contain" fill priority sizes="(min-width: 1280px) 600px, 50vw" src="/news-hero.png"/></div>
    </section>

    <nav className="news-categories" aria-label="Danh mục tin tức">
      {categories.map(category => <button type="button" aria-pressed={activeCategory === category} key={category} onClick={() => chooseCategory(category)}>{category}</button>)}
    </nav>

    <section className="news-workspace">
      <div className="news-main">
        <div className="news-lead-grid">
          <article className="news-headline">
            <Image alt="Hình minh họa chi nhánh D4 Bank" className="object-cover" fill sizes="(min-width: 1280px) 36vw, 90vw" src="/d4-headquarters.png"/>
            <div className="news-headline-copy"><span className="news-badge">Tin nổi bật</span><h2>{headline.title}</h2><p>{headline.description}</p><button type="button" onClick={() => setSelectedNews(headline)}>Xem chi tiết <ArrowRight size={15} aria-hidden="true"/></button></div>
          </article>
          <div className="news-teasers">{teasers.map(item => <button type="button" className="card news-teaser" key={item.id} aria-label={"Đọc tin: " + item.title} onClick={() => setSelectedNews(item)}><NewsThumb item={item}/><span className="news-teaser-copy"><span className="news-category-tag">{item.category}</span><strong>{item.title}</strong><span className="news-date"><CalendarDays size={12} aria-hidden="true"/>{item.date}</span></span></button>)}</div>
        </div>

        <article className="card news-latest-panel">
          <header><h2>{activeCategory === "Tất cả" ? "Tin tức mới nhất" : activeCategory}</h2><button type="button" onClick={() => chooseCategory("Tất cả")}>Xem tất cả <ArrowRight size={14} aria-hidden="true"/></button></header>
          <div className="news-latest-rows" ref={rowsRef} aria-label="Danh sách tin tức">
            {visibleNews.map(item => <article className="news-record" key={item.id}><NewsThumb item={item}/><div className="news-record-copy"><h3><button type="button" title={item.title} onClick={() => setSelectedNews(item)}>{item.title}</button></h3><p title={item.description}>{item.description}</p><span className="news-record-meta"><time>{item.date}</time><span>{item.category}</span></span></div><button type="button" className="news-open-button" aria-label={"Xem " + item.title} onClick={() => setSelectedNews(item)}><ArrowRight size={16} aria-hidden="true"/></button></article>)}
            {visibleNews.length === 0 && <div className="news-empty" role="status"><Landmark aria-hidden="true"/><strong>Chưa có tin trong danh mục này</strong><p>Chọn danh mục khác để xem các bài viết demo.</p><button type="button" onClick={() => chooseCategory("Tất cả")}>Xem tất cả tin</button></div>}
          </div>
          <footer className="news-pagination"><span aria-live="polite">Hiển thị {first}–{last} trong tổng số {filteredNews.length} tin</span><div><span>Trang <b>{safePage}/{totalPages}</b></span><button type="button" aria-label="Trang tin trước" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16}/></button><button type="button" aria-label="Trang tin sau" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight size={16}/></button></div></footer>
        </article>
      </div>

      <aside className="news-sidebar">
        <article className="card news-featured"><h2>Tin tức nổi bật</h2><div>{featured.map((item, index) => <button type="button" key={item.id} aria-label={"Đọc tin nổi bật: " + item.title} onClick={() => setSelectedNews(item)}><span className="news-rank">{index + 1}</span><NewsThumb item={item}/><span className="news-featured-copy"><strong>{item.title}</strong><time>{item.date}</time></span></button>)}</div></article>
        <article className="card news-category-panel"><h2>Danh mục tin tức</h2><div>{categories.slice(1).map(category => { const Icon = categoryIcons[category]; const count = newsItems.filter(item => item.category === category).length; return <button type="button" aria-pressed={activeCategory === category} key={category} onClick={() => chooseCategory(category)}><Icon size={16} aria-hidden="true"/><span>{category}</span><b>{count}</b></button>; })}</div></article>
      </aside>
    </section>

    <Modal open={Boolean(selectedNews)} onOpenChange={open => !open && setSelectedNews(null)} title={selectedNews?.title ?? "Chi tiết tin tức"} description={selectedNews ? selectedNews.category + " · " + selectedNews.date : undefined}>
      {selectedNews && <div className="news-detail"><span className="news-category-tag">Nội dung demo</span><div className="news-detail-art"><NewsThumb item={selectedNews}/></div><p>{selectedNews.description}</p><p className="news-detail-note">Bài viết minh họa cho website ngân hàng mô phỏng D4 Bank.</p><button type="button" className="btn-primary" onClick={() => setSelectedNews(null)}>Đóng bài viết</button></div>}
    </Modal>
  </div>;
}
