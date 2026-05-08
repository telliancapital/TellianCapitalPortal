"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
} from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 50;

interface Document {
  id: string;
  key: string;
  customerId: string;
  filename: string;
  title: string;
  fileFormat: string;
  fileSize: string;
  lastModified: string | null;
  downloadUrl: string;
}

interface DocumentsResponse {
  documents: Document[];
  nextCursor: string | null;
  isAdmin: boolean;
  error?: string;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale === "de" ? "de-CH" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DocumentsPage() {
  const { t, locale } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursorArg: string | null, append: boolean) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursorArg) params.set("cursor", cursorArg);
      const res = await fetch(`/api/documents?${params}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as DocumentsResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load");
      }
      setDocuments((prev) =>
        append ? [...prev, ...(data.documents ?? [])] : data.documents ?? [],
      );
      setCursor(data.nextCursor ?? null);
    },
    [],
  );

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setInitialLoading(true);
      setError(null);
      try {
        await fetchPage(null, false);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message ?? "Failed to load");
          setDocuments([]);
          setCursor(null);
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, fetchPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage(cursor, true);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load");
    } finally {
      setLoadingMore(false);
    }
  }

  const isAdmin = user?.isAdmin ?? false;
  const groupedByCustomer = useMemo(() => {
    if (!isAdmin) return null;
    const map = new Map<string, Document[]>();
    for (const doc of documents) {
      const id = doc.customerId || "—";
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(doc);
    }
    return Array.from(map.entries()).map(([customerId, docs]) => ({
      customerId,
      docs,
    }));
  }, [documents, isAdmin]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpanded(customerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  return (
    <PortalLayout>
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
          {t(cursor ? "docs.countMore" : "docs.count", {
            n: documents.length,
          })}
        </p>
      </div>

      {initialLoading ? (
        <div style={{ padding: "96px 0" }} className="flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : documents.length > 0 ? (
        <>
          <div
            style={{
              borderTop: "1px solid var(--tellian-line)",
              borderBottom: "1px solid var(--tellian-line)",
            }}
          >
            {isAdmin && groupedByCustomer
              ? groupedByCustomer.map(({ customerId, docs }) => (
                  <CustomerGroup
                    key={customerId}
                    customerId={customerId}
                    docs={docs}
                    locale={locale}
                    isOpen={expanded.has(customerId)}
                    onToggle={() => toggleExpanded(customerId)}
                  />
                ))
              : documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    locale={locale}
                    isAdmin={false}
                  />
                ))}
          </div>

          {error && (
            <p
              role="alert"
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                color: "var(--tellian-charcoal)",
                padding: "16px 0 0",
              }}
            >
              {error}
            </p>
          )}

          {cursor && (
            <div
              className="flex justify-center"
              style={{ padding: "32px 0 16px" }}
            >
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  background: "transparent",
                  border: "1px solid var(--tellian-line)",
                  padding: "12px 28px",
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--tellian-dark)",
                  cursor: loadingMore ? "not-allowed" : "pointer",
                  opacity: loadingMore ? 0.6 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  transition: "opacity 200ms ease-out",
                }}
              >
                {t("docs.loadMore")}
                {loadingMore && (
                  <Loader2 size={14} className="animate-spin" />
                )}
              </button>
            </div>
          )}
        </>
      ) : error ? (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            color: "var(--tellian-charcoal)",
            padding: "24px 0",
          }}
        >
          {error}
        </p>
      ) : (
        <EmptyState t={t} />
      )}
    </PortalLayout>
  );
}

function DocumentRow({
  doc,
  locale,
  isAdmin,
}: {
  doc: Document;
  locale: string;
  isAdmin: boolean;
}) {
  return (
    <a
      href={doc.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
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
        textDecoration: "none",
        transition: "background-color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--tellian-bg-secondary)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
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

      <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end sm:shrink-0 gap-4">
        <span
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--tellian-stone)",
          }}
        >
          {isAdmin && doc.customerId ? `${doc.customerId} · ` : ""}
          {formatDate(doc.lastModified, locale)}
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
    </a>
  );
}

function CustomerGroup({
  customerId,
  docs,
  locale,
  isOpen,
  onToggle,
}: {
  customerId: string;
  docs: Document[];
  locale: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--tellian-line)" }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full text-left"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          padding: "20px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <span
          className="flex items-center"
          style={{
            gap: "12px",
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: "22px",
            fontWeight: 400,
            color: "var(--tellian-dark)",
          }}
        >
          {isOpen ? (
            <ChevronDown size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
          {customerId}
        </span>
        <span
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "13px",
            color: "var(--tellian-stone)",
          }}
        >
          {docs.length}
        </span>
      </button>
      {isOpen && (
        <div style={{ paddingLeft: "30px", paddingBottom: "8px" }}>
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              locale={locale}
              isAdmin={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ t }: { t: (key: "docs.empty.headline" | "docs.empty.subtitle") => string }) {
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
