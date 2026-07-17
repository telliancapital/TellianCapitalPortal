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
    <PortalLayout sectionLabel={t("portal.nav.reports")}>
      <div
        className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] lg:items-start"
        style={{
          maxWidth: "1200px",
          paddingTop: "clamp(32px, 5vw, 48px)",
          paddingBottom: "48px",
          gap: "clamp(32px, 4vw, 64px)",
        }}
      >
      <div>
        <p
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "14px",
            color: "var(--tellian-stone)",
            margin: "0 0 8px 0",
          }}
        >
          {t("docs.greeting", { name: user?.username ?? "—" })}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-lustria), 'Lustria', serif",
            fontSize: "clamp(24px, 4vw, 40px)",
            fontWeight: 400,
            color: "var(--tellian-dark)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          <em style={{ fontStyle: "italic", fontWeight: 400 }}>
            {t("docs.headline")}
          </em>
        </h1>
        {!initialLoading && (
          <p
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--tellian-stone)",
              marginTop: "8px",
              marginBottom: 0,
            }}
          >
            {t("docs.count", { n: sortedDocuments.length })}
          </p>
        )}

        <div
          className="flex flex-wrap items-end gap-4"
          style={{ marginTop: "28px" }}
        >
          <div
            style={{
              flex: "1 1 180px",
              minWidth: "180px",
              position: "relative",
            }}
          >
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--tellian-stone)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder={t("docs.search.placeholder")}
              value={searchTerm}
              onChange={(e) => updateSearch(e.target.value)}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: "1.5px solid var(--tellian-line)",
                borderRadius: 0,
                padding: "10px 0 10px 28px",
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "14px",
                color: "var(--tellian-dark)",
                outline: "none",
                transition: "border-color 200ms ease",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderBottomColor = "var(--tellian-dark)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderBottomColor = "var(--tellian-line)")
              }
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor="sort-select"
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--tellian-stone)",
                whiteSpace: "nowrap",
              }}
            >
              {t("docs.sort.label")}
            </label>
            <select
              id="sort-select"
              value={sortKey}
              onChange={(e) => updateSort(e.target.value as SortKey)}
              style={{
                background: "transparent",
                border: "1px solid var(--tellian-line)",
                borderRadius: "2px",
                padding: "6px 28px 6px 8px",
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "13px",
                color: "var(--tellian-dark)",
                cursor: "pointer",
                outline: "none",
                minHeight: "36px",
              }}
            >
              <option value="newest">{t("docs.sort.newest")}</option>
              <option value="oldest">{t("docs.sort.oldest")}</option>
              <option value="titleAsc">{t("docs.sort.titleAsc")}</option>
              <option value="titleDesc">{t("docs.sort.titleDesc")}</option>
            </select>
          </div>
        </div>

      {initialLoading ? (
        <div style={{ padding: "96px 0" }} className="flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : sortedDocuments.length > 0 ? (
        <>
          <div style={{ marginTop: "24px" }}>
            <div
              className="hidden lg:grid"
              style={{
                gridTemplateColumns: "1fr 120px 120px 140px",
                gap: "16px",
                padding: "12px 0",
                borderBottom: "1.5px solid var(--tellian-dark)",
              }}
            >
              {[t("docs.col.title"), t("docs.col.date"), t("docs.col.format"), ""].map(
                (h, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: "var(--font-inter), 'Inter', sans-serif",
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "var(--tellian-stone)",
                    }}
                  >
                    {h}
                  </span>
                ),
              )}
            </div>
            {isAdmin && groupedByCustomer
              ? groupedByCustomer.map(({ customerId, docs }) => (
                  <CustomerGroup
                    key={customerId}
                    customerId={customerId}
                    docs={docs}
                    locale={locale}
                    isOpen={expanded.has(customerId)}
                    onToggle={() => toggleExpanded(customerId)}
                    t={t}
                  />
                ))
              : paginatedDocuments.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    locale={locale}
                    isAdmin={false}
                    t={t}
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
      </div>

      <aside>
        <div
          style={{
            padding: "24px",
            backgroundColor: "var(--tellian-bg-secondary)",
            borderRadius: "8px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--tellian-stone)",
              display: "block",
              marginBottom: "16px",
            }}
          >
            {t("docs.rm.headline")}
          </span>
          {user?.rm ? (
            <div className="flex items-start" style={{ gap: "16px" }}>
              {user.rm.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, next/image can't proxy this
                <img
                  src={user.rm.imageUrl}
                  alt={`${user.rm.firstName ?? ""} ${user.rm.lastName ?? ""}`.trim()}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    backgroundColor: "var(--tellian-purple)",
                    color: "var(--tellian-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-inter), 'Inter', sans-serif",
                    fontSize: "18px",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                  }}
                >
                  {(user.rm.firstName?.[0] ?? "") + (user.rm.lastName?.[0] ?? "")}
                </div>
              )}
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-inter), 'Inter', sans-serif",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "var(--tellian-dark)",
                    display: "block",
                  }}
                >
                  {`${user.rm.firstName ?? ""} ${user.rm.lastName ?? ""}`.trim()}
                </span>
                {user.rm.email && (
                  <a
                    href={`mailto:${user.rm.email}`}
                    style={{
                      fontFamily: "var(--font-inter), 'Inter', sans-serif",
                      fontSize: "13px",
                      color: "var(--tellian-stone)",
                      textDecoration: "none",
                      display: "block",
                      marginTop: "4px",
                    }}
                  >
                    {user.rm.email}
                  </a>
                )}
                {user.rm.phone && (
                  <a
                    href={`tel:${user.rm.phone.replace(/\s/g, "")}`}
                    style={{
                      fontFamily: "var(--font-inter), 'Inter', sans-serif",
                      fontSize: "13px",
                      color: "var(--tellian-stone)",
                      textDecoration: "none",
                      display: "block",
                      marginTop: "2px",
                    }}
                  >
                    {user.rm.phone}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "13px",
                color: "var(--tellian-stone)",
                fontStyle: "italic",
              }}
            >
              {t("docs.rm.noRm")}
            </span>
          )}
        </div>

        {(user?.street || user?.city || user?.zipCode) && (
          <div
            style={{
              padding: "16px 24px",
              borderLeft: "2px solid var(--tellian-line)",
              marginTop: "24px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--tellian-stone)",
                display: "block",
                marginBottom: "10px",
              }}
            >
              {t("docs.profile.address")}
            </span>
            <div
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "13px",
                color: "var(--tellian-dark)",
                lineHeight: 1.5,
              }}
            >
              {user.street && (
                <span style={{ display: "block" }}>{user.street}</span>
              )}
              {(user.zipCode || user.city) && (
                <span style={{ display: "block" }}>
                  {[user.zipCode, user.city].filter(Boolean).join(" ")}
                </span>
              )}
            </div>
          </div>
        )}

        <div
          className="flex items-center"
          style={{ gap: "10px", marginTop: "32px" }}
        >
          <div
            style={{
              width: "16px",
              height: "1px",
              backgroundColor: "var(--tellian-line)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "9px",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--tellian-stone)",
            }}
          >
            {t("login.footer")}
          </span>
        </div>
      </aside>
      </div>
    </PortalLayout>
  );
}

function DocumentRow({
  doc,
  locale,
  isAdmin,
  t,
}: {
  doc: Document;
  locale: string;
  isAdmin: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const dateLabel = `${isAdmin && doc.customerId ? `${doc.customerId} · ` : ""}${formatDate(doc.lastModified, locale)}`;

  return (
    <a
      href={doc.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="grid grid-cols-1 lg:grid-cols-[1fr_120px_120px_140px] lg:items-center lg:gap-4 group"
      style={{
        padding: "16px 0",
        borderBottom: "1px solid var(--tellian-line)",
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
      {/* Mobile / tablet: stacked card row */}
      <div className="flex items-start justify-between gap-3 lg:hidden">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--tellian-dark)",
              display: "block",
            }}
          >
            {doc.title}
          </span>
          <span
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "12px",
              color: "var(--tellian-stone)",
              display: "block",
              marginTop: "4px",
            }}
          >
            {dateLabel} · {doc.fileFormat} · {doc.fileSize}
          </span>
        </div>
        <span
          aria-label={`${t("docs.download")}: ${doc.title}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "44px",
            minHeight: "44px",
            color: "var(--tellian-stone)",
            flexShrink: 0,
          }}
        >
          <ArrowDownToLine size={16} />
        </span>
      </div>

      {/* Desktop: 4-column grid row */}
      <div className="hidden lg:contents">
        <span
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--tellian-dark)",
          }}
        >
          {doc.title}
        </span>
        <span
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "13px",
            color: "var(--tellian-stone)",
          }}
        >
          {dateLabel}
        </span>
        <span
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "13px",
            color: "var(--tellian-stone)",
          }}
        >
          {doc.fileFormat} · {doc.fileSize}
        </span>
        <span
          className="inline-flex items-center"
          style={{
            gap: "6px",
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--tellian-stone)",
          }}
        >
          <ArrowDownToLine size={14} />
          {t("docs.download")}
        </span>
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
  t,
}: {
  customerId: string;
  docs: Document[];
  locale: string;
  isOpen: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useI18n>["t"];
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
            fontFamily: "var(--font-lustria), 'Lustria', serif",
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
              t={t}
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
          fontFamily: "var(--font-lustria), 'Lustria', serif",
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
          fontFamily: "var(--font-lustria), 'Lustria', serif",
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
