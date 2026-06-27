"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Course {
  id: string;          // YouTube playlist ID  e.g. "PLu0W_9lII9agwh1XjRt242xIpHhPT2llg"
  label: string;       // Human-readable title the user typed (or auto-derived)
  currentTrackIndex: number; // 0-based position inside the playlist
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the playlist ID from any standard YouTube URL.
 * Handles:
 *   https://www.youtube.com/playlist?list=PLxxx
 *   https://www.youtube.com/watch?v=xxxxx&list=PLxxx&index=3
 *   https://youtu.be/xxxxx?list=PLxxx
 */
function extractPlaylistId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.searchParams.get("list");
  } catch {
    // Not a valid URL — try a naive regex fallback
    const match = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Builds the canonical youtube-nocookie embed URL for a playlist.
 *
 * Correct format:
 *   https://www.youtube-nocookie.com/embed/videoseries?list=<ID>&index=<N>
 *
 * Key points:
 *   • "videoseries" is the special path segment that tells YouTube to treat
 *     this as a playlist embed rather than a single video.
 *   • `list`  – the playlist ID
 *   • `index` – 0-based position; YouTube honours it on first load.
 *   • `autoplay=0` – prevents auto-play on navigation (polite default).
 *   • `rel=0`      – suppresses related-video suggestions at the end.
 *   • Uses www.youtube-nocookie.com (the privacy-enhanced domain) so the
 *     embed does NOT add videos to the viewer's Google watch history.
 */
function buildEmbedUrl(playlistId: string, trackIndex: number): string {
  const base = "https://www.youtube-nocookie.com/embed/videoseries";
  const params = new URLSearchParams({
    list: playlistId,
    index: String(trackIndex),
    autoplay: "0",
    rel: "0",
  });
  return `${base}?${params.toString()}`;
}

const STORAGE_KEY = "focus_tracker_courses";

function loadCourses(): Course[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Course[]) : [];
  } catch {
    return [];
  }
}

function saveCourses(courses: Course[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  // null  → Dashboard view
  // Course → Workspace view
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [inputError, setInputError] = useState("");

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    setCourses(loadCourses());
  }, []);

  // Persist whenever the courses list changes
  useEffect(() => {
    saveCourses(courses);
  }, [courses]);

  // ── Dashboard actions ──────────────────────────────────────────────────────

  const handleAddCourse = useCallback(() => {
    setInputError("");
    const playlistId = extractPlaylistId(urlInput);
    if (!playlistId) {
      setInputError(
        "Could not find a playlist ID. Paste a full YouTube playlist URL (must contain ?list=…)."
      );
      return;
    }
    // Prevent duplicates
    if (courses.some((c) => c.id === playlistId)) {
      setInputError("That playlist is already in your list.");
      return;
    }
    const newCourse: Course = {
      id: playlistId,
      label: labelInput.trim() || `Playlist ${courses.length + 1}`,
      currentTrackIndex: 0,
    };
    setCourses((prev) => [...prev, newCourse]);
    setUrlInput("");
    setLabelInput("");
  }, [urlInput, labelInput, courses]);

  const handleDeleteCourse = useCallback((id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleResume = useCallback((course: Course) => {
    setActiveCourse(course);
  }, []);

  // ── Workspace actions ──────────────────────────────────────────────────────

  const handleExitWorkspace = useCallback(() => {
    setActiveCourse(null);
  }, []);

  /**
   * Update the track index both in local state (for the iframe) and persist it
   * back into the courses array so the next "Resume" starts at the right position.
   */
  const handleSetTrackIndex = useCallback(
    (newIndex: number) => {
      if (!activeCourse) return;
      const updated: Course = { ...activeCourse, currentTrackIndex: newIndex };
      setActiveCourse(updated);
      setCourses((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
    },
    [activeCourse]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col">
      {activeCourse ? (
        <WorkspaceView
          course={activeCourse}
          onExit={handleExitWorkspace}
          onSetTrackIndex={handleSetTrackIndex}
        />
      ) : (
        <DashboardView
          courses={courses}
          urlInput={urlInput}
          labelInput={labelInput}
          inputError={inputError}
          onUrlChange={setUrlInput}
          onLabelChange={setLabelInput}
          onAdd={handleAddCourse}
          onResume={handleResume}
          onDelete={handleDeleteCourse}
        />
      )}
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

interface DashboardViewProps {
  courses: Course[];
  urlInput: string;
  labelInput: string;
  inputError: string;
  onUrlChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onAdd: () => void;
  onResume: (c: Course) => void;
  onDelete: (id: string) => void;
}

function DashboardView({
  courses,
  urlInput,
  labelInput,
  inputError,
  onUrlChange,
  onLabelChange,
  onAdd,
  onResume,
  onDelete,
}: DashboardViewProps) {
  return (
    <main className="flex flex-col gap-10 px-8 py-10 max-w-4xl mx-auto w-full">
      {/* ── Header ── */}
      <header>
        <p className="text-xs tracking-widest text-neutral-500 uppercase mb-1">
          Focus Tracker
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          // LEARNING QUEUE
        </h1>
      </header>

      {/* ── Add form ── */}
      <section className="border border-neutral-700 p-6 flex flex-col gap-4">
        <p className="text-xs tracking-widest text-neutral-400 uppercase">
          Add Playlist
        </p>

        <input
          type="text"
          placeholder="YouTube playlist URL  (e.g. https://youtube.com/playlist?list=PL…)"
          value={urlInput}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          className="bg-transparent border border-neutral-700 text-sm text-white placeholder-neutral-600
                     px-4 py-3 focus:outline-none focus:border-white transition-colors"
        />

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Label  (optional)"
            value={labelInput}
            onChange={(e) => onLabelChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            className="flex-1 bg-transparent border border-neutral-700 text-sm text-white
                       placeholder-neutral-600 px-4 py-3 focus:outline-none focus:border-white
                       transition-colors"
          />
          <button
            onClick={onAdd}
            className="border border-white text-white text-sm px-6 py-3 hover:bg-white
                       hover:text-black transition-colors tracking-widest uppercase"
          >
            Save
          </button>
        </div>

        {inputError && (
          <p className="text-xs text-red-400">{inputError}</p>
        )}
      </section>

      {/* ── Course grid ── */}
      {courses.length === 0 ? (
        <p className="text-neutral-600 text-sm">
          No playlists yet. Paste a YouTube playlist URL above to get started.
        </p>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onResume={onResume}
              onDelete={onDelete}
            />
          ))}
        </section>
      )}
    </main>
  );
}

// ─── Course Card ──────────────────────────────────────────────────────────────

interface CourseCardProps {
  course: Course;
  onResume: (c: Course) => void;
  onDelete: (id: string) => void;
}

function CourseCard({ course, onResume, onDelete }: CourseCardProps) {
  return (
    <div className="border border-neutral-700 p-5 flex flex-col gap-4 hover:border-neutral-400 transition-colors">
      <div className="flex flex-col gap-1">
        <p className="text-base font-bold tracking-tight truncate">
          {course.label}
        </p>
        <p className="text-xs text-neutral-500 font-mono truncate">
          {course.id}
        </p>
        <p className="text-xs text-neutral-600 uppercase tracking-widest">
          Track {course.currentTrackIndex + 1}
        </p>
      </div>

      <div className="flex gap-3 mt-auto">
        <button
          onClick={() => onResume(course)}
          className="flex-1 border border-white text-white text-xs py-2 px-4
                     hover:bg-white hover:text-black transition-colors tracking-widest uppercase"
        >
          Resume
        </button>
        <button
          onClick={() => onDelete(course.id)}
          className="border border-neutral-700 text-neutral-500 text-xs py-2 px-4
                     hover:border-red-600 hover:text-red-500 transition-colors tracking-widest uppercase"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Workspace View ───────────────────────────────────────────────────────────

interface WorkspaceViewProps {
  course: Course;
  onExit: () => void;
  onSetTrackIndex: (index: number) => void;
}

// Sidebar shows this many index slots; adjust freely.
const SIDEBAR_SLOTS = 20;

function WorkspaceView({ course, onExit, onSetTrackIndex }: WorkspaceViewProps) {
  /*
   * ── THE FIX ──────────────────────────────────────────────────────────────
   * buildEmbedUrl() returns a fully-formed string like:
   *   https://www.youtube-nocookie.com/embed/videoseries?list=PLxxx&index=2&autoplay=0&rel=0
   *
   * We assign it to a const and pass that const to the <iframe src>.
   * This avoids any template-literal interpolation pitfalls.
   * ─────────────────────────────────────────────────────────────────────────
   */
  const embedUrl = buildEmbedUrl(course.id, course.currentTrackIndex);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 shrink-0">
        <button
          onClick={onExit}
          className="text-xs text-neutral-400 hover:text-white transition-colors tracking-widest uppercase"
        >
          ← Exit to Directory
        </button>
        <span className="text-xs text-neutral-500 tracking-widest font-mono">
          INDEX:&nbsp;{course.currentTrackIndex + 1}
        </span>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── iframe player ── */}
        <div className="flex-1 bg-neutral-950 flex items-center justify-center overflow-hidden">
          <iframe
            key={embedUrl}          /* forces a remount when URL changes */
            src={embedUrl}
            title={`${course.label} — video ${course.currentTrackIndex + 1}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>

        {/* ── Sidebar queue ── */}
        <aside className="w-64 shrink-0 border-l border-neutral-800 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 shrink-0">
            <p className="text-xs tracking-widest text-neutral-400 uppercase font-mono">
              // Queue Indexer
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {Array.from({ length: SIDEBAR_SLOTS }, (_, i) => (
              <button
                key={i}
                onClick={() => onSetTrackIndex(i)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-neutral-800
                            font-mono tracking-widest transition-colors
                            ${
                              i === course.currentTrackIndex
                                ? "bg-white text-black font-bold"
                                : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                            }`}
              >
                Position #{i + 1}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Footer label ── */}
      <div className="px-6 py-2 border-t border-neutral-800 shrink-0">
        <p className="text-xs font-mono tracking-widest text-neutral-600 uppercase truncate">
          {course.label}
        </p>
      </div>
    </div>
  );
}