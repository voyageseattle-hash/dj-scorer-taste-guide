import { useEffect, useState, type FormEvent } from "react";

import {
  Compass,
  ArrowUpRight,
  Sparkles,
  Loader2,
  CalendarDays,
  Headphones,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import { apiRequest } from "../lib/api";
import { REGIONS, localDateKey } from "../lib/regions";
import {
  MUSIC_GENRES,
  TASTE_GOALS,
  type MusicGenre,
  type TasteGoal,
  type TasteStatus,
  type TasteChoice,
  type TastePlan,
} from "../lib/tasteTypes";

export default function TasteGuide() {

  const [status, setStatus] = useState<TasteStatus | null>(null);
  const [genre, setGenre] = useState<MusicGenre>("house");
  const [goal, setGoal] = useState<TasteGoal>("smooth_transitions");
  const [region, setRegion] = useState("ALL");
  const [choices, setChoices] = useState<TasteChoice[]>([]);
  const [choiceToken, setChoiceToken] = useState("");
  const [plan, setPlan] = useState<TastePlan | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const loadStatus = async () => {
    try {
      const response = await fetch("/api/taste/status");
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error();
      setStatus(await response.json());
    } catch {
      setError("The taste service couldn’t load. Refresh to try again.");
    }
  };
  useEffect(() => {
    loadStatus();
  }, []);
  useEffect(() => {
    setChoices([]);
    setChoiceToken("");
  }, [genre]);
  useEffect(() => { setPlan(null); }, [genre, goal, region]);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("Searching music tags…");
    setError("");
    setPlan(null);
    setChoices([]);
    setChoiceToken("");
    try {
      const response = await apiRequest<{ choices: TasteChoice[] }>(
        "/api/taste/tags",
        { genre },
      );
      setChoices(response.choices);
      if (!response.choices.length)
        setError(
          "Qloo didn’t return a compatible music tag. Try another sound.",
        );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const build = async () => {
    setBusy("Exploring artists and building your plan…");
    setError("");
    setPlan(null);
    try {
      setPlan(
        await apiRequest<TastePlan>("/api/taste/plan", {
          choiceToken,
          goal,
          region,
          today: localDateKey(),
        }),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const preview = async () => {
    setBusy("Opening the offline example…");
    setError("");
    setPlan(null);
    try {
      const response = await fetch("/api/taste/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, region, today: localDateKey() }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The example couldn’t load.");
      setPlan(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="page-shell taste-guide">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FROM YOUR SOUND TO YOUR NEXT STEP</p>
          <h1>Taste guide</h1>
          <p>
            Explore a sound, find a night, and give your next practice session a
            purpose.
          </p>
        </div>
        <Compass className="taste-heading-icon" size={34} />
      </div>
      {error && (
        <div className="inline-notice error" role="alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}
      <div className="taste-status surface-card">
        <span
          className={
            "taste-source " + (status?.state === "ready" ? "live" : "example")
          }
        >
          {status?.state === "ready"
            ? "Live search configured"
            : "Live search unavailable"}
        </span>
        <p>{status ? status.message : "Checking taste search availability…"}</p>
        <button className="text-link" onClick={loadStatus} disabled={!!busy}>
          <RefreshCw size={14} />
          Refresh status
        </button>
      </div>
      <div className="taste-workspace">
        <section className="surface-card taste-controls">
          <p className="eyebrow">01 · CHOOSE YOUR DIRECTION</p>
          <h2>A sound to build on.</h2>
          <div className="taste-fields">
            <label>
              Practice goal
              <select
                value={goal}
                onChange={(event) => setGoal(event.target.value as TasteGoal)}
                disabled={!!busy}
              >
                {TASTE_GOALS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scene region
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                disabled={!!busy}
              >
                {REGIONS.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <form onSubmit={search}>
            <label className="taste-genre-label">
              Music genre
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value as MusicGenre)}
                disabled={!!busy}
              >
                {MUSIC_GENRES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="method-note">
              Search sends the genre you choose to Qloo. Confirm the music tag
              before it shapes your plan.
            </p>
            <button
              className="button-primary"
              disabled={status?.state !== "ready" || !!busy}
            >
              <Sparkles size={16} />
              Find music tags
            </button>
          </form>
          {choices.length > 0 && (
            <fieldset className="taste-choices">
              <legend>02 · CONFIRM THE MUSIC TAG</legend>
              {choices.map((choice) => (
                <label key={choice.token}>
                  <input
                    type="radio"
                    name="taste-tag"
                    value={choice.token}
                    checked={choiceToken === choice.token}
                    onChange={() => setChoiceToken(choice.token)}
                    disabled={!!busy}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
              <button
                type="button"
                className="button-primary"
                disabled={!choiceToken || !!busy}
                onClick={build}
              >
                Build my plan
                <ArrowUpRight size={15} />
              </button>
            </fieldset>
          )}
          {busy && (
            <p className="taste-progress" role="status">
              <Loader2 size={17} className="animate-spin" />
              {busy}
            </p>
          )}
        </section>
        <aside className="surface-card taste-example">
          <span className="taste-source example">Offline example</span>
          <h2>See the path from taste to practice.</h2>
          <p>
            Explore an example with invented artists, Qloo responses, and scene
            listings. It demonstrates the workflow without making a Qloo
            request.
          </p>
          <button
            className="button-secondary"
            onClick={preview}
            disabled={!!busy}
          >
            Try offline example
            <ArrowUpRight size={15} />
          </button>
          <small>
            The example starts with house. Your selected goal and region shape
            the demonstration.
          </small>
        </aside>
      </div>
      {plan && (
        <section className="taste-plan" aria-label="Your taste plan">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR NEXT CHAPTER</p>
              <h2>{plan.selectedGenre} to your next set.</h2>
            </div>
            <span
              className={
                "taste-source " + (plan.mode === "qloo" ? "live" : "example")
              }
            >
              {plan.mode === "qloo"
                ? "Qloo results + DJ Scorer plan"
                : "Offline example · invented data"}
            </span>
          </div>
          <div className="taste-trace">
            {plan.trace.map((step, index) => (
              <div key={step.label}>
                <span className="taste-step-number">{index + 1}</span>
                <strong>{step.label}</strong>
                <small>{step.source}</small>
                <p>{step.detail}</p>
              </div>
            ))}
          </div>
          <div className="taste-results-grid">
            <section className="surface-card taste-artists">
              <p className="eyebrow">LISTEN WITH CURIOSITY</p>
              <h3>Artists to explore</h3>
              {plan.artists.length ? (
                plan.artists.map((artist) => (
                  <div className="taste-artist" key={artist.id}>
                    <Headphones size={17} />
                    <strong>{artist.name}</strong>
                    {artist.affinity !== null && (
                      <small>
                        Aggregate affinity {artist.affinity.toFixed(3)}
                      </small>
                    )}
                  </div>
                ))
              ) : (
                <p>No artist suggestions were returned for this selection.</p>
              )}
              <p className="method-note">
                {plan.mode === "qloo"
                  ? "Qloo's aggregate cultural affinities are not individual preference probabilities."
                  : "Artist names and affinity values are invented for this example."}
              </p>
            </section>
            <section className="surface-card taste-practice">
              <p className="eyebrow">MAKE IT A SESSION</p>
              <h3>{plan.practice.title}</h3>
              <span className="taste-duration">
                {plan.practice.minutes} minutes ·{" "}
                {plan.relatedGenres.join(" / ")}
              </span>
              <ol>
                {plan.practice.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="taste-check">
                <Check size={17} />
                <p>{plan.practice.check}</p>
              </div>
              <p className="method-note">Use your own recording setup to listen back and compare your transitions.</p>
            </section>
          </div>
          <section className="surface-card taste-events">
            <div className="section-heading">
              <div>
                <p className="eyebrow">TAKE IT OUT OF THE STUDIO</p>
                <h3>Scene connections</h3>
              </div>
              
            </div>
            {plan.events.length ? (
              <div className="taste-event-grid">
                {plan.events.map((event) => (
                  <article key={event.id}>
                    <span>
                      <CalendarDays size={14} />
                      {event.date} · {event.region}
                    </span>
                    <h4>{event.title}</h4>
                    <p>{event.location}</p>
                    <div className="taste-match-reasons">
                      {event.reasons.map((reason) => (
                        <small key={reason}>{reason}</small>
                      ))}
                    </div>
                    <small className="taste-event-source">{event.source}</small>
                    {event.url && (
                      <a
                        className="text-link"
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Listing details
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p>
                {plan.calendarStatus === "empty"
                  ? "No real event listings are bundled with this focused demo. The offline example demonstrates scene matching with fictional venues."
                  : "No upcoming listing matched these music tags in the selected region. Try another region or sound."}
              </p>
            )}
            <p className="method-note">
              Matches use listing tags and title text. Artist mentions are not
              independently verified performances.
            </p>
          </section>
          <div className="review-limitations">
            <AlertCircle size={17} />
            <span>{plan.limitations.join(" ")}</span>
          </div>
        </section>
      )}
    </div>
  );
}
