"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 10;
const FETCH_BATCH = 200;

type SortKey = "newest" | "oldest" | "titleAsc" | "titleDesc";

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

function extractDateFromFilename(filename: string): string | null {
  const matches = [...filename.matchAll(/(?<!\d)(\d{8})(?!\d)/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const digits = matches[i][1];
    const dd = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    const yyyy = Number(digits.slice(4, 8));
    if (
      yyyy < 1900 ||
      yyyy > 2100 ||
      mm < 1 ||
      mm > 12 ||
      dd < 1 ||
      dd > 31
    ) {
      continue;
    }
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      date.getUTCFullYear() === yyyy &&
      date.getUTCMonth() === mm - 1 &&
      date.getUTCDate() === dd
    ) {
      return date.toISOString();
    }
  }
  return null;
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
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const hasUserMgmtAccess =
    user?.isAdmin || user?.groups.includes("InternalEmployee");

  useEffect(() => {
    if (!authLoading && hasUserMgmtAccess) {
      router.replace("/admin");
    }
  }, [authLoading, hasUserMgmtAccess, router]);

  const fetchAll = useCallback(async (): Promise<Document[]> => {
    const all: Document[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: String(FETCH_BATCH) });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/documents?${params}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as DocumentsResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load");
      }
      for (const doc of data.documents ?? []) {
        all.push({
          ...doc,
          lastModified: extractDateFromFilename(doc.filename),
        });
      }
      cursor = data.nextCursor ?? null;
    } while (cursor);
    return all;
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    if (hasUserMgmtAccess) return;
    let cancelled = false;
    (async () => {
      setInitialLoading(true);
      setError(null);
      try {
        const all = await fetchAll();
        if (!cancelled) setDocuments(all);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message ?? "Failed to load");
          setDocuments([]);
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, hasUserMgmtAccess, fetchAll]);

  const filteredDocuments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => {
      const haystack = `${d.title} ${d.filename} ${d.customerId}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [documents, searchTerm]);

  const sortedDocuments = useMemo(() => {
    const list = [...filteredDocuments];
    list.sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return (b.lastModified ?? "").localeCompare(a.lastModified ?? "");
        case "oldest":
          return (a.lastModified ?? "").localeCompare(b.lastModified ?? "");
        case "titleAsc":
          return a.title.localeCompare(b.title);
        case "titleDesc":
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
    return list;
  }, [filteredDocuments, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedDocuments.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDocuments = sortedDocuments.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const updateSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const updateSort = (value: SortKey) => {
    setSortKey(value);
    setCurrentPage(1);
  };

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
          {t("docs.count", { n: sortedDocuments.length })}
        </p>

        <div
          className="flex flex-wrap items-center justify-between gap-4"
          style={{ marginTop: "32px" }}
        >
          <div
            style={{
              flex: "1 1 280px",
              maxWidth: "400px",
              position: "relative",
            }}
          >
            <Search
              size={18}
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--tellian-stone)",
              }}
            />
            <input
              type="text"
              placeholder={t("docs.search.placeholder")}
              value={searchTerm}
              onChange={(e) => updateSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 28px 12px 32px",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: "1px solid var(--tellian-line)",
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "14px",
                color: "var(--tellian-dark)",
                outline: "none",
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => updateSearch("")}
                aria-label="Clear search"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--tellian-stone)",
                  padding: "4px",
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--tellian-stone)",
            }}
          >
            {t("docs.sort.label")}
            <select
              value={sortKey}
              onChange={(e) => updateSort(e.target.value as SortKey)}
              style={{
                background: "transparent",
                border: "1px solid var(--tellian-line)",
                padding: "8px 12px",
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "13px",
                color: "var(--tellian-dark)",
                cursor: "pointer",
                letterSpacing: "normal",
                textTransform: "none",
              }}
            >
              <option value="newest">{t("docs.sort.newest")}</option>
              <option value="oldest">{t("docs.sort.oldest")}</option>
              <option value="titleAsc">{t("docs.sort.titleAsc")}</option>
              <option value="titleDesc">{t("docs.sort.titleDesc")}</option>
            </select>
          </label>
        </div>
      </div>

      {initialLoading ? (
        <div style={{ padding: "96px 0" }} className="flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : sortedDocuments.length > 0 ? (
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
              : paginatedDocuments.map((doc) => (
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

          {!isAdmin && totalPages > 1 && (
            <div
              className="flex items-center justify-between"
              style={{
                marginTop: "32px",
                marginBottom: "48px",
                paddingTop: "24px",
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
              }}
            >
              <div style={{ fontSize: "13px", color: "var(--tellian-stone)" }}>
                {t("docs.pagination.info", {
                  current: safePage,
                  total: totalPages,
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    border: "1px solid var(--tellian-line)",
                    background: "transparent",
                    color: "var(--tellian-dark)",
                    cursor: safePage === 1 ? "not-allowed" : "pointer",
                    opacity: safePage === 1 ? 0.3 : 1,
                  }}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, safePage + 1))
                  }
                  disabled={safePage === totalPages}
                  aria-label="Next page"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    border: "1px solid var(--tellian-line)",
                    background: "transparent",
                    color: "var(--tellian-dark)",
                    cursor:
                      safePage === totalPages ? "not-allowed" : "pointer",
                    opacity: safePage === totalPages ? 0.3 : 1,
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
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
      ) : searchTerm ? (
        <EmptySearchState t={t} />
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

function EmptySearchState({
  t,
}: {
  t: (key: "docs.empty.search.headline" | "docs.empty.search.subtitle") => string;
}) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: "96px 24px" }}
    >
      <Search
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
        {t("docs.empty.search.headline")}
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
        {t("docs.empty.search.subtitle")}
      </p>
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
