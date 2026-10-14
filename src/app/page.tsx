"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalLayout } from "@/components/PortalLayout";
import { useAuth } from "@/lib/auth";
import { useI18n, type Locale } from "@/lib/i18n";
import { C, LABEL, sans, serif, selectChevron } from "@/lib/tokens";
import { DURATION } from "@/lib/motion";

/* ═══════════════════════════════════════════════════════════
   CLIENT DASHBOARD — "Ihre Dokumente"
   Layout mirrors the design portal ClientDashboard; data comes
   from /api/documents (presigned S3 download URLs).
   ═══════════════════════════════════════════════════════════ */

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

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale === "de" ? "de-CH" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
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

  const rm = user?.rm ?? null;
  const rmName = rm ? `${rm.firstName ?? ""} ${rm.lastName ?? ""}`.trim() : "";
  const rmInitials = rm
    ? `${rm.firstName?.[0] ?? ""}${rm.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  return (
    <PortalLayout variant="client">
      <div
        className="w-full flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start gap-10 lg:gap-[clamp(32px,4vw,64px)] px-5 pt-8 pb-12 md:px-[clamp(32px,4vw,64px)] md:pt-12 md:pb-16"
        style={{ maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}
      >
        {/* ── LEFT: Documents ── */}
        <div style={{ minWidth: 0 }}>
          <h1
            className="text-[clamp(28px,8vw,34px)] md:text-[clamp(32px,3vw,40px)]"
            style={{
              fontFamily: serif,
              lineHeight: 1.1,
              color: C.dark,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              margin: 0,
            }}
          >
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>{t("docs.headline")}</em>
          </h1>
          {!initialLoading && !error && (
            <p
              style={{
                fontFamily: sans,
                fontSize: 13,
                color: C.stoneText,
                margin: "10px 0 0 0",
                lineHeight: 1.5,
              }}
            >
              {documents.length === 1
                ? t("docs.countOne")
                : t("docs.count", { n: documents.length })}
            </p>
          )}

          {/* Search + Sort row */}
          <div
            className="flex flex-wrap md:flex-nowrap items-end"
            style={{ gap: 16, marginTop: 32 }}
          >
            <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: C.stoneText,
                  pointerEvents: "none",
                }}
              >
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => updateSearch(e.target.value)}
                placeholder={t("docs.search.placeholder")}
                aria-label={t("docs.search.placeholder")}
                style={{
                  fontFamily: sans,
                  fontSize: 14,
                  color: C.dark,
                  backgroundColor: "transparent",
                  border: "none",
                  borderBottom: `1.5px solid ${C.line}`,
                  borderRadius: 0,
                  padding: "10px 0 10px 28px",
                  outline: "none",
                  width: "100%",
                  transition: `border-color ${DURATION.fast}ms ease`,
                }}
                onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.dark)}
                onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.line)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <label htmlFor="sort-select" style={{ ...LABEL, whiteSpace: "nowrap" }}>
                {t("docs.sort.label")}
              </label>
              <select
                id="sort-select"
                value={sortKey}
                onChange={(e) => updateSort(e.target.value as SortKey)}
                style={{
                  fontFamily: sans,
                  fontSize: 13,
                  color: C.dark,
                  backgroundColor: "transparent",
                  border: `1px solid ${C.line}`,
                  borderRadius: 2,
                  padding: "6px 28px 6px 8px",
                  cursor: "pointer",
                  outline: "none",
                  appearance: "none",
                  minHeight: 40,
                  backgroundImage: selectChevron("68635A"),
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                }}
              >
                <option value="newest">{t("docs.sort.newest")}</option>
                <option value="oldest">{t("docs.sort.oldest")}</option>
                <option value="titleAsc">{t("docs.sort.titleAsc")}</option>
                <option value="titleDesc">{t("docs.sort.titleDesc")}</option>
              </select>
            </div>
          </div>

          {/* ── DOCUMENT LIST — loading / error / empty / loaded ── */}
          <div style={{ marginTop: 24 }} aria-live="polite">
            {initialLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 0" }}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 56,
                      borderRadius: 4,
                      background: `linear-gradient(90deg, ${C.subtle} 25%, ${C.line} 50%, ${C.subtle} 75%)`,
                      backgroundSize: "200% 100%",
                      animation: "skeleton-shimmer 1.5s ease infinite",
                    }}
                  />
                ))}
              </div>
            )}

            {!initialLoading && error && (
              <div
                role="alert"
                style={{
                  padding: "32px 24px",
                  textAlign: "center",
                  backgroundColor: C.errorBg,
                  border: `1px solid ${C.error}`,
                  borderRadius: 4,
                  marginTop: 8,
                }}
              >
                <span style={{ fontFamily: sans, fontSize: 14, color: C.error }}>
                  {t("docs.error")}
                </span>
              </div>
            )}

            {!initialLoading && !error && sortedDocuments.length === 0 && (
              <p
                style={{
                  fontFamily: sans,
                  fontSize: 14,
                  color: C.stoneText,
                  fontStyle: "italic",
                  padding: "48px 0",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                {searchTerm ? t("docs.empty.search.headline") : t("docs.empty.headline")}
              </p>
            )}

            {!initialLoading && !error && sortedDocuments.length > 0 && (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_120px_44px]"
                    style={{
                      gap: 16,
                      padding: "12px 0",
                      borderBottom: `1.5px solid ${C.dark}`,
                    }}
                  >
                    <span style={LABEL}>{t("docs.col.title")}</span>
                    <span style={LABEL}>{t("docs.col.date")}</span>
                    <span />
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
                          downloadLabel={t("docs.download")}
                        />
                      ))
                    : paginatedDocuments.map((doc) => (
                        <DocumentRow
                          key={doc.id}
                          doc={doc}
                          locale={locale}
                          downloadLabel={t("docs.download")}
                        />
                      ))}
                </div>

                {!isAdmin && totalPages > 1 && (
                  <div
                    className="flex items-center justify-between"
                    style={{ marginTop: 32, paddingTop: 24, fontFamily: sans }}
                  >
                    <div style={{ fontSize: 13, color: C.stoneText }}>
                      {t("docs.pagination.info", { current: safePage, total: totalPages })}
                    </div>
                    <div className="flex gap-2">
                      <PageButton
                        label="Previous page"
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                        direction="prev"
                      />
                      <PageButton
                        label="Next page"
                        disabled={safePage === totalPages}
                        onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                        direction="next"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR: Relationship Manager ── */}
        <aside>
          <div style={{ padding: 24, backgroundColor: C.bgSecondary, borderRadius: 8 }}>
            <span style={{ ...LABEL, display: "block", marginBottom: 16 }}>
              {t("docs.rm.headline")}
            </span>

            {rm ? (
              <>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {rm.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, next/image can't proxy this
                    <img
                      src={rm.imageUrl}
                      alt={rmName}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      aria-label={t("docs.rm.noPhoto")}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        backgroundColor: C.purple,
                        color: C.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: sans,
                        fontSize: 18,
                        fontWeight: 500,
                        flexShrink: 0,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {rmInitials}
                    </div>
                  )}
                  <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: C.dark, display: "block" }}>
                    {rmName}
                  </span>
                </div>

                {(rm.email || rm.phone) && (
                  <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                    {rm.email && (
                      <a href={`mailto:${rm.email}`} className="tellian-portal-kontakt">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <rect x="3" y="5" width="18" height="14" rx="1.5" />
                          <path d="M3.5 6l8.5 7 8.5-7" />
                        </svg>
                        <span>{rm.email}</span>
                      </a>
                    )}
                    {rm.phone && (
                      <a href={`tel:${rm.phone.replace(/\s/g, "")}`} className="tellian-portal-kontakt">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" />
                        </svg>
                        <span>{rm.phone}</span>
                      </a>
                    )}
                  </div>
                )}

                {rm.email && (
                  <a
                    href={`mailto:${rm.email}`}
                    className="tellian-portal-cta"
                    style={{
                      marginTop: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      minHeight: 48,
                      fontFamily: sans,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: C.bg,
                      backgroundColor: C.purple,
                      textDecoration: "none",
                      borderRadius: 0,
                    }}
                  >
                    {t("docs.rm.contact")}
                    <span aria-hidden>→</span>
                  </a>
                )}
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    backgroundColor: C.subtle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.stoneText} strokeWidth="1.5" aria-hidden>
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span style={{ fontFamily: sans, fontSize: 13, color: C.stoneText, fontStyle: "italic" }}>
                  {t("docs.rm.noRm")}
                </span>
              </div>
            )}
          </div>

          {(user?.street || user?.city || user?.zipCode) && (
            <div style={{ padding: "16px 24px", borderLeft: `2px solid ${C.line}`, marginTop: 24 }}>
              <span style={{ ...LABEL, display: "block", marginBottom: 10 }}>
                {t("docs.profile.address")}
              </span>
              <div style={{ fontFamily: sans, fontSize: 14, color: C.dark, lineHeight: 1.5 }}>
                {user.street && <span style={{ display: "block" }}>{user.street}</span>}
                {(user.zipCode || user.city) && (
                  <span style={{ display: "block" }}>
                    {[user.zipCode, user.city].filter(Boolean).join(" ")}
                  </span>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        .tellian-portal-dokument-icon { transition: background-color ${DURATION.fast}ms ease, color ${DURATION.fast}ms ease; }
        .tellian-portal-dokument:hover .tellian-portal-dokument-icon { color: ${C.dark}; background-color: ${C.bgSecondary}; }
        .tellian-portal-dokument:focus-visible,
        .tellian-portal-gruppe:focus-visible,
        .tellian-portal-kontakt:focus-visible,
        .tellian-portal-cta:focus-visible { outline: 2px solid ${C.purple}; outline-offset: 2px; }
        .tellian-portal-kontakt {
          display: flex; align-items: center; gap: 10px; min-height: 36px;
          font-family: ${sans}; font-size: 14px; color: ${C.dark};
          text-decoration: none;
        }
        .tellian-portal-kontakt svg { color: ${C.stoneText}; flex-shrink: 0; }
        .tellian-portal-kontakt:hover span { text-decoration: underline; text-underline-offset: 3px; }
        .tellian-portal-cta { transition: background-color ${DURATION.fast}ms ease; }
        .tellian-portal-cta:hover { background-color: ${C.purpleHover} !important; }
      `}</style>
    </PortalLayout>
  );
}

/* Whole row is the download link (presigned URL). */
function DocumentRow({
  doc,
  locale,
  downloadLabel,
}: {
  doc: Document;
  locale: Locale;
  downloadLabel: string;
}) {
  const date = formatDate(doc.lastModified, locale);
  return (
    <a
      href={doc.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${downloadLabel}: ${doc.title}`}
      className="tellian-portal-dokument grid grid-cols-[minmax(0,1fr)_44px] lg:grid-cols-[minmax(0,1fr)_120px_44px] gap-3 lg:gap-4 items-center"
      style={{
        padding: "16px 0",
        borderBottom: `1px solid ${C.line}`,
        textDecoration: "none",
        color: C.dark,
        width: "100%",
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 500, color: C.dark, display: "block" }}>
          {doc.title}
        </span>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.stoneText, display: "block", marginTop: 4 }}>
          <span className="lg:hidden">{date} · </span>
          {doc.fileFormat} · {doc.fileSize}
        </span>
      </span>
      <span className="hidden lg:block" style={{ fontFamily: sans, fontSize: 13, color: C.stoneText }}>
        {date}
      </span>
      <span
        className="tellian-portal-dokument-icon"
        style={{
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.stoneText,
          borderRadius: "50%",
        }}
      >
        <DownloadIcon size={18} />
      </span>
    </a>
  );
}

function CustomerGroup({
  customerId,
  docs,
  locale,
  isOpen,
  onToggle,
  downloadLabel,
}: {
  customerId: string;
  docs: Document[];
  locale: Locale;
  isOpen: boolean;
  onToggle: () => void;
  downloadLabel: string;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="tellian-portal-gruppe"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "20px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: serif,
            fontSize: 22,
            fontWeight: 400,
            color: C.dark,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
            style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: `transform ${DURATION.fast}ms ease` }}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          {customerId}
        </span>
        <span style={{ fontFamily: sans, fontSize: 13, color: C.stoneText }}>{docs.length}</span>
      </button>
      {isOpen && (
        <div style={{ paddingLeft: 30, paddingBottom: 8 }}>
          {docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} locale={locale} downloadLabel={downloadLabel} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "prev" | "next";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        border: `1px solid ${C.line}`,
        borderRadius: 2,
        background: "transparent",
        color: C.dark,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        {direction === "prev" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
