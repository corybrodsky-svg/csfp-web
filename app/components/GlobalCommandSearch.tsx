"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  FINDER_CHIPS,
  isEditableFinderTarget,
  normalizeFinderText,
  scoreFinderIndexedEntry,
  type EventFinderScope,
  type FinderChipKey,
  type FinderIndexedEvent,
  type FinderResult,
} from "../lib/eventFinder";

export type GlobalCommandSearchCommand = {
  id: string;
  label: string;
  detail?: string;
  keywords?: string[];
  group?: "Commands" | "Tools" | "Schedules" | "Admin";
  onSelect: () => void;
};

type GlobalCommandSearchMode = "dashboard" | "command-center";

type GlobalCommandSearchProps = {
  entries: FinderIndexedEvent[];
  loading: boolean;
  onOpenEvent: (eventId: string) => void;
  myEventIds?: Set<string>;
  scope?: EventFinderScope;
  placeholder?: string;
  compact?: boolean;
  currentEventId?: string | null;
  mode?: GlobalCommandSearchMode;
  commands?: GlobalCommandSearchCommand[];
};

export default function GlobalCommandSearch({
  entries,
  loading,
  onOpenEvent,
  myEventIds,
  scope = "all",
  placeholder,
  compact = false,
  currentEventId = null,
  mode = "dashboard",
  commands = [],
}: GlobalCommandSearchProps) {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<FinderChipKey | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = deferredQuery.trim();
  const hasActiveSearch = Boolean(query.trim() || activeChip);
  const commandCenterMode = mode === "command-center";
  const inputPlaceholder =
    placeholder ||
    (commandCenterMode ? "Search events, SPs, schedules, rooms, tools..." : "Find event...");

  const rankedMatches = useMemo<FinderResult[]>(() => {
    if (!hasActiveSearch) return [];

    return entries
      .map((entry) => ({
        entry,
        score: scoreFinderIndexedEntry(entry, trimmedQuery, {
          activeChip,
          myEventIds,
          scope,
        }),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (!a.entry.start && !b.entry.start) return 0;
        if (!a.entry.start) return 1;
        if (!b.entry.start) return -1;
        return a.entry.start.getTime() - b.entry.start.getTime();
      });
  }, [activeChip, entries, hasActiveSearch, myEventIds, scope, trimmedQuery]);

  const visibleResults = rankedMatches.slice(0, 20);
  const hiddenMatchCount = Math.max(rankedMatches.length - visibleResults.length, 0);
  const normalizedCommandQuery = normalizeFinderText(trimmedQuery);
  const visibleCommandResults = useMemo(() => {
    if (!commandCenterMode || !hasActiveSearch || activeChip) return [] as GlobalCommandSearchCommand[];
    if (!normalizedCommandQuery) return [];
    const tokens = normalizedCommandQuery.split(/\s+/).filter(Boolean);
    return commands
      .map((command) => {
        const searchText = normalizeFinderText([
          command.label,
          command.detail,
          command.group,
          ...(command.keywords || []),
        ].join(" "));
        if (!tokens.every((token) => searchText.includes(token))) return null;
        let score = 40;
        if (normalizeFinderText(command.label).startsWith(normalizedCommandQuery)) score += 80;
        if (normalizeFinderText(command.label).includes(normalizedCommandQuery)) score += 40;
        return { command, score };
      })
      .filter((item): item is { command: GlobalCommandSearchCommand; score: number } => Boolean(item))
      .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label))
      .slice(0, 12)
      .map((item) => item.command);
  }, [activeChip, commandCenterMode, commands, hasActiveSearch, normalizedCommandQuery]);

  const chipOptions = useMemo(
    () =>
      FINDER_CHIPS.map((chip) => ({
        ...chip,
        count: entries.reduce((count, entry) => count + (entry.chipMatches[chip.key] ? 1 : 0), 0),
      })),
    [entries]
  );

  const quickStats = useMemo(
    () => ({
      operations: entries.length,
      attention: entries.reduce((count, entry) => count + (entry.needsAttention ? 1 : 0), 0),
      today: entries.reduce((count, entry) => count + (entry.chipMatches.live_today ? 1 : 0), 0),
    }),
    [entries]
  );

  useEffect(() => {
    function handleSlashShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== "/" || isEditableFinderTarget(event.target)) return;
      event.preventDefault();
      window.requestAnimationFrame(() => inputRef.current?.focus());
      setResultsOpen(Boolean(query.trim() || activeChip));
    }

    window.addEventListener("keydown", handleSlashShortcut);
    return () => window.removeEventListener("keydown", handleSlashShortcut);
  }, [activeChip, query]);

  function clearSearch() {
    setQuery("");
    setActiveChip(null);
    setResultsOpen(false);
    inputRef.current?.focus();
  }

  function openEvent(eventId: string) {
    setResultsOpen(false);
    onOpenEvent(eventId);
  }

  function runCommand(command: GlobalCommandSearchCommand) {
    setResultsOpen(false);
    command.onSelect();
  }

  function toggleChip(chip: FinderChipKey) {
    const nextChip = activeChip === chip ? null : chip;
    setActiveChip(nextChip);
    setResultsOpen(Boolean(query.trim() || nextChip));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div
      className={`relative ${commandCenterMode ? "cfsp-command-search" : "cfsp-dashboard-search"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          clearSearch();
          return;
        }
        if (event.key === "Enter" && resultsOpen && (visibleCommandResults[0] || visibleResults[0])) {
          event.preventDefault();
          if (commandCenterMode && visibleCommandResults[0]) {
            runCommand(visibleCommandResults[0]);
          } else {
            openEvent(visibleResults[0].entry.eventId);
          }
        }
      }}
    >
      <div className={`rounded-[16px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] shadow-[var(--cfsp-card-glow)] ${compact ? "px-3 py-3" : "px-4 py-3"}`}>
        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setResultsOpen(Boolean(event.target.value.trim() || activeChip));
            }}
            onFocus={() => setResultsOpen(hasActiveSearch)}
            autoComplete="off"
            spellCheck={false}
            aria-label={commandCenterMode ? "Global command search" : "Dashboard event search"}
            aria-expanded={resultsOpen && hasActiveSearch}
            aria-controls={commandCenterMode ? "global-command-search-results" : "dashboard-event-search-results"}
            role="combobox"
            placeholder={inputPlaceholder}
            className={`w-full rounded-[12px] border border-[var(--cfsp-input-border)] bg-[var(--cfsp-input-bg)] text-[var(--cfsp-text)] placeholder:text-[var(--cfsp-text-muted)] font-semibold outline-none transition focus:ring-2 focus:ring-[var(--cfsp-blue)] focus:ring-offset-1 focus:ring-offset-[var(--cfsp-surface)] ${compact ? "px-3 py-2.5 text-[0.96rem]" : "px-4 py-3 text-[1.02rem]"}`}
          />
          {query || activeChip ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-[8px] px-2 py-0.5 text-xs font-bold"
              style={{ color: "var(--cfsp-text-muted)" }}
              aria-label="Clear search"
            >
              Clear
            </button>
          ) : null}
        </div>

        {!commandCenterMode ? (
          <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2.5" : "mt-3"}`}>
            {chipOptions.map((chip) => {
              const selected = activeChip === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => toggleChip(chip.key)}
                  className="inline-flex h-7 items-center gap-1 rounded-[999px] border px-3 py-0.5 text-xs font-semibold transition"
                  style={{
                    borderColor: selected ? "var(--cfsp-blue)" : "var(--cfsp-border)",
                    background: selected ? "var(--cfsp-blue)" : "var(--cfsp-surface)",
                    color: selected ? "#fff" : "var(--cfsp-text-muted)",
                  }}
                  aria-pressed={selected}
                >
                  {chip.label}
                  <span
                    className="rounded-full border border-transparent px-1.5 py-0 text-[0.6rem] font-bold"
                    style={{ background: selected ? "rgba(255,255,255,0.2)" : "var(--cfsp-surface-muted)" }}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--cfsp-text-muted)] ${compact ? "mt-1.5" : "mt-2"}`}>
        {commandCenterMode ? (
          <>
            <span>Commands</span>
            <span>·</span>
            <span>Events</span>
            <span>·</span>
            <span>Tools</span>
          </>
        ) : (
          <>
            <span>{quickStats.operations} events</span>
            <span>·</span>
            <span>{quickStats.attention} needing attention</span>
            <span>·</span>
            <span>{quickStats.today} live / today</span>
          </>
        )}
        <span>·</span>
        <span>Press / to search</span>
      </div>

      {resultsOpen && hasActiveSearch ? (
        <div
          id={commandCenterMode ? "global-command-search-results" : "dashboard-event-search-results"}
          role="listbox"
          className={`relative grid max-h-[360px] gap-1.5 overflow-y-auto rounded-[14px] p-2 ${compact ? "mt-2" : "mt-3"}`}
          style={{
            border: "1px solid var(--cfsp-border)",
            background: "var(--cfsp-surface)",
            boxShadow: "var(--cfsp-card-glow)",
          }}
        >
          {commandCenterMode && visibleCommandResults.length ? (
            <div className="grid gap-1.5">
              <div className="px-2 py-1 text-[0.66rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">
                Commands
              </div>
              {visibleCommandResults.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => runCommand(command)}
                  className="rounded-[11px] border px-3 py-2.5 text-left transition"
                  style={{
                    border: "1px solid var(--cfsp-border)",
                    background: "var(--cfsp-surface-muted)",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.04)",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[0.95rem] font-black text-[var(--cfsp-text)]">{command.label}</div>
                    <span
                      className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold"
                      style={{
                        border: "var(--cfsp-command-center-chip-border)",
                        background: "var(--cfsp-command-center-chip-bg)",
                        color: "var(--cfsp-blue)",
                      }}
                    >
                      {command.group || "Command"}
                    </span>
                  </div>
                  {command.detail ? (
                    <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">{command.detail}</div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {commandCenterMode && visibleResults.length ? (
            <div className="px-2 py-1 text-[0.66rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">
              Events
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-[12px] border border-dashed border-[var(--cfsp-border)] px-3 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
              Loading events...
            </div>
          ) : visibleResults.length ? (
            visibleResults.map((result) => {
              const eventId = encodeURIComponent(result.entry.eventId);
              const eventHref = `/events/${eventId}`;
              const builderHref = `/events/${eventId}/schedule-builder`;
              const operationalHref = `${eventHref}#coverage-actions`;
              const showTrainingMaterialsAction = result.entry.hasTrainingOrMaterialContext;
              const isCurrentEvent = currentEventId === result.entry.eventId;

              return (
                <div
                  key={result.entry.eventId}
                  role="option"
                  aria-selected="false"
                  className="rounded-[11px] border px-3 py-2.5 transition"
                  style={{
                    border: "1px solid var(--cfsp-border)",
                    background: isCurrentEvent ? "rgba(20, 91, 150, 0.08)" : "var(--cfsp-surface-muted)",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <button type="button" onClick={() => openEvent(result.entry.eventId)} className="w-full text-left">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-[0.98rem] font-black text-[var(--cfsp-text)]">
                            {result.entry.eventName}
                          </div>
                          {isCurrentEvent ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-[0.08em]"
                          style={{
                            border: "var(--cfsp-status-progress-border)",
                            background: "var(--cfsp-status-progress-bg)",
                            color: "var(--cfsp-blue)",
                          }}
                            >
                              Current
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                          <span>{result.entry.dateLabel}</span>
                          <span>•</span>
                          <span>{result.entry.eventLocation}</span>
                        </div>
                      </div>
                      <span
                        className="rounded-lg px-2.5 py-1 text-[0.68rem] font-semibold"
                        style={{
                          border: "var(--cfsp-status-complete-border)",
                          background: "var(--cfsp-status-complete-bg)",
                          color: "var(--cfsp-green-dark)",
                        }}
                      >
                        {result.entry.modeLabel}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[
                        result.entry.eventTypeLabel,
                        result.entry.trainingLabel,
                        result.entry.staffingLabel,
                        result.entry.shortageLabel,
                        result.entry.modalityLabel,
                      ].map((label) => (
                        <span
                          key={`${result.entry.eventId}-${label}`}
                          className="rounded-lg px-2 py-1 text-[0.68rem] font-medium"
                          style={{
                            border: "1px solid var(--cfsp-border)",
                            background: label.toLowerCase().includes("shortage")
                              ? "var(--cfsp-danger-soft)"
                              : "var(--cfsp-status-info-bg)",
                            color: label.toLowerCase().includes("shortage") ? "var(--cfsp-danger)" : "var(--cfsp-text)",
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </button>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Link
                      href={eventHref}
                      onClick={() => setResultsOpen(false)}
                      className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold no-underline transition"
                      style={{
                        border: "1px solid var(--cfsp-blue)",
                        background: "rgba(20, 91, 150, 0.08)",
                        color: "var(--cfsp-blue)",
                      }}
                    >
                      Open Event
                    </Link>
                    <Link
                      href={builderHref}
                      onClick={() => setResultsOpen(false)}
                      className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold no-underline transition"
                      style={{
                        border: "1px solid rgba(25, 138, 112, 0.35)",
                        background: "rgba(25, 138, 112, 0.08)",
                        color: "var(--cfsp-green-dark)",
                      }}
                    >
                      Open Builder
                    </Link>
                    {showTrainingMaterialsAction ? (
                      <Link
                        href={operationalHref}
                        onClick={() => setResultsOpen(false)}
                        className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold no-underline transition"
                        style={{
                          border: "1px solid rgba(243, 187, 103, 0.44)",
                          background: "rgba(243, 187, 103, 0.12)",
                          color: "var(--cfsp-warning)",
                        }}
                      >
                        Training / Materials
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : visibleCommandResults.length ? null : (
            <div className="rounded-[12px] border border-dashed border-[var(--cfsp-border)] px-3 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
              {commandCenterMode ? "No matching commands or events found." : "No matching events found."}
            </div>
          )}
          {!loading && hiddenMatchCount > 0 ? (
            <div className="px-2 py-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
              Showing top {visibleResults.length} matches. {hiddenMatchCount} more matches available.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
