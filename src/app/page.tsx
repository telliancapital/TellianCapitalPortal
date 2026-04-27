"use client";

import { ArrowDownToLine, FileText } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { useI18n } from "@/lib/i18n";

// TODO: replace with backend call (Supabase Storage list)

interface Document {
  id: string;
  title: string;
  type: string;
  date: Date;
  fileSize: string;
  fileFormat: string;
}

const MOCK_DOCUMENTS: Document[] = [
  { id: "1",  title: "Q1 2026 Performance-Report",   type: "Quartalsbericht", date: new Date("2026-04-10"), fileSize: "3.1 MB", fileFormat: "PDF" },
  { id: "2",  title: "März 2026 Monatsbericht",      type: "Monatsbericht",   date: new Date("2026-04-02"), fileSize: "1.8 MB", fileFormat: "PDF" },
  { id: "3",  title: "Februar 2026 Monatsbericht",   type: "Monatsbericht",   date: new Date("2026-03-04"), fileSize: "1.7 MB", fileFormat: "PDF" },
  { id: "4",  title: "Q4 2025 Performance-Report",   type: "Quartalsbericht", date: new Date("2026-01-14"), fileSize: "2.9 MB", fileFormat: "PDF" },
  { id: "5",  title: "Dezember 2025 Monatsbericht",  type: "Monatsbericht",   date: new Date("2026-01-03"), fileSize: "1.6 MB", fileFormat: "PDF" },
  { id: "6",  title: "Q3 2025 Performance-Report",   type: "Quartalsbericht", date: new Date("2025-10-12"), fileSize: "2.4 MB", fileFormat: "PDF" },
  { id: "7",  title: "Q2 2025 Performance-Report",   type: "Quartalsbericht", date: new Date("2025-07-11"), fileSize: "2.6 MB", fileFormat: "PDF" },
  { id: "8",  title: "Q1 2025 Performance-Report",   type: "Quartalsbericht", date: new Date("2025-04-09"), fileSize: "2.3 MB", fileFormat: "PDF" },
  { id: "9",  title: "Q4 2024 Performance-Report",   type: "Quartalsbericht", date: new Date("2025-01-13"), fileSize: "2.8 MB", fileFormat: "PDF" },
  { id: "10", title: "Q3 2024 Performance-Report",   type: "Quartalsbericht", date: new Date("2024-10-10"), fileSize: "2.2 MB", fileFormat: "PDF" },
];

function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === "de" ? "de-CH" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DocumentsPage() {
  const { t, locale } = useI18n();
  const documents = MOCK_DOCUMENTS;

  return (
    <PortalLayout>
      {/* Page header */}
      <div
        style={{
          paddingTop: "clamp(48px, 8vh, 96px)",
          paddingBottom: "clamp(32px, 5vh, 64px)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 300,
            color: "var(--tellian-dark)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {t("docs.headline")}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "16px",
            fontWeight: 400,
            color: "var(--tellian-stone)",
            marginTop: "12px",
            marginBottom: 0,
          }}
        >
          {t("docs.count", { n: documents.length })}
        </p>
      </div>

      {/* Document list or empty state */}
      {documents.length > 0 ? (
        <div style={{ borderTop: "1px solid var(--tellian-line)", borderBottom: "1px solid var(--tellian-line)" }}>
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} locale={locale} t={t} />
          ))}
        </div>
      ) : (
        <EmptyState t={t} />
      )}
    </PortalLayout>
  );
}

function DocumentRow({ doc, locale, t }: { doc: Document; locale: string; t: (key: any, vars?: any) => string }) {
  function handleClick() {
    // TODO: replace with signed URL download from Supabase Storage
    console.log(`Downloading: ${doc.title}`);
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left group"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "6px 16px",
        padding: "24px 0",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--tellian-line)",
        cursor: "pointer",
        width: "100%",
        transition: "background-color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--tellian-bg-secondary)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {/* Title — full width on mobile, shrinks on desktop */}
      <span
        className="truncate w-full sm:w-auto sm:flex-1 sm:min-w-0"
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontSize: "22px",
          fontWeight: 400,
          color: "var(--tellian-dark)",
          lineHeight: 1.3,
        }}
      >
        {doc.title}
      </span>

      {/* Meta row — wraps below title on mobile, stays right on desktop */}
      <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end sm:shrink-0 gap-4">
        <span
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--tellian-stone)",
          }}
        >
          {t(`type.${doc.type}` as any)} · {formatDate(doc.date, locale)}
        </span>
        <div className="flex items-center gap-4 shrink-0">
          <span
            className="hidden md:inline"
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--tellian-muted)",
            }}
          >
            {doc.fileFormat} · {doc.fileSize}
          </span>
          <ArrowDownToLine
            size={18}
            className="text-tellian-stone group-hover:text-tellian-dark transition-colors duration-200"
          />
        </div>
      </div>
    </button>
  );
}

function EmptyState({ t }: { t: (key: any) => string }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: "96px 24px" }}
    >
      <FileText
        size={48}
        style={{ color: "var(--tellian-muted)", opacity: 0.5 }}
      />
      <h2
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontSize: "28px",
          fontWeight: 400,
          color: "var(--tellian-dark)",
          margin: 0,
          marginTop: "24px",
        }}
      >
        {t("docs.empty.headline")}
      </h2>
      <p
        style={{
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
          fontSize: "15px",
          fontWeight: 400,
          color: "var(--tellian-stone)",
          lineHeight: 1.6,
          marginTop: "12px",
          marginBottom: 0,
          maxWidth: "400px",
        }}
      >
        {t("docs.empty.subtitle")}
      </p>
    </div>
  );
}
