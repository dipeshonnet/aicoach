import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Headphones,
  Layers3,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { useOverview } from "../lib/overview";
import type { Assignment } from "../shared/types";
import { Badge, Empty, Notice, PageTitle } from "../components/ui";
import { Stat } from "../components/Stat";
import { AssignmentCard } from "../components/AssignmentCard";
import { StartDialog } from "../components/StartDialog";

export function Dashboard({
  trainingOnly = false,
}: {
  trainingOnly?: boolean;
}) {
  const data = useOverview(),
    agent = data.user.role === "agent";
  const pending = data.attempts.filter(
      (t) => t.mode === "assessment" && t.status === "submitted",
    ),
    completed = data.assignments.filter((a) => a.completed).length,
    rate = data.assignments.length
      ? Math.round((100 * completed) / data.assignments.length)
      : 0;
  const [start, setStart] = useState<Assignment | null>(null);
  if (agent)
    return (
      <>
        <PageTitle
          eyebrow="YOUR LEARNING JOURNEY"
          title={
            trainingOnly
              ? "Your training, at your pace."
              : "A little practice. A lot of confidence."
          }
          description="Learn the steps, practise the conversation, and get ready for the real thing."
        />
        <div className="stats-grid">
          <Stat
            label="Assigned scenarios"
            value={data.assignments.length}
            icon={BookOpen}
            detail="Your current learning plan"
          />
          <Stat
            label="Completed"
            value={completed}
            icon={CheckCheck}
            detail="Approved by your trainer"
          />
          <Stat
            label="Awaiting review"
            value={pending.length}
            icon={Clock3}
            detail="Assessment results with your trainer"
          />
          <Stat
            label="Completion"
            value={rate + "%"}
            icon={FileCheck2}
            detail="Across all required channels"
          />
        </div>
        {!data.aiConfigured && (
          <Notice>
            Chat and voice need a Groq API key configured by your administrator.
            Screenshot walkthroughs and back-office assessments are available.
          </Notice>
        )}
        <div className="section-head">
          <div>
            <span className="eyebrow">NEXT UP</span>
            <h2>Your assigned scenarios</h2>
          </div>
          <Badge>{data.assignments.length} assignments</Badge>
        </div>
        {data.assignments.length ? (
          <div className="scenario-grid">
            {data.assignments.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                onStart={() => setStart(a)}
              />
            ))}
          </div>
        ) : (
          <Empty title="Your learning journey starts here">
            Your trainer will assign scenarios to you or your batch. They will
            appear here when ready.
          </Empty>
        )}
        {start && (
          <StartDialog assignment={start} onClose={() => setStart(null)} />
        )}
      </>
    );
  const activeUserIds = new Set(
    data.users.filter((u) => !u.banned).map((u) => u.id),
  );
  const activeAgents = new Set(
    data.assignments
      .filter((a) => activeUserIds.has(a.user_id))
      .map((a) => a.user_id),
  ).size;
  return (
    <>
      <PageTitle
        eyebrow="LET’S BUILD CONFIDENCE"
        title={"Good to see you, " + data.user.name.split(" ")[0] + "."}
        description="A clear view of your team’s practice, progress, and readiness."
        action={
          <Link className="button primary" to="/scenarios/new">
            <Plus size={17} />
            Create scenario
          </Link>
        }
      />
      <div className="dashboard-hero">
        <div>
          <span className="hero-label">
            <span className="status-dot" />
            THE NEXT CONFIDENT FIRST DAY
          </span>
          <h2>
            Better practice.
            <br />
            Stronger teams.
          </h2>
          <p>
            Turn everyday work into meaningful learning.
            <br />
            Give new hires a safe place to get it right.
          </p>
          <Link to="/scenarios" className="button hero-button">
            Explore scenario library
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="art-center">
            <GraduationMark />
          </div>
          <span className="art-bubble bubble-one">
            <CheckCircle2 size={21} />
            <span>
              One step closer<small>Confidence in progress</small>
            </span>
          </span>
          <span className="art-bubble bubble-two">
            <Sparkles size={18} />
            Room to grow
          </span>
          <span className="art-star">✦</span>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Active learners"
          value={activeAgents}
          icon={Users}
          detail="Agents with assigned training"
        />
        <Stat
          label="Scenario library"
          value={data.scenarios.length}
          icon={Layers3}
          detail={
            data.scenarios.filter((s) => s.published_version).length +
            " published and ready"
          }
        />
        <Stat
          label="Training completion"
          value={rate + "%"}
          icon={FileCheck2}
          detail={
            completed +
            " of " +
            data.assignments.length +
            " assignments approved"
          }
        />
        <Stat
          label="Awaiting review"
          value={pending.length}
          icon={Clock3}
          detail="A trainer’s next opportunity to coach"
          warm
        />
      </div>
      <div className="dashboard-columns">
        <section>
          <div className="section-head">
            <div>
              <span className="eyebrow">BUILT FOR THE REAL WORK</span>
              <h2>Recent scenarios</h2>
            </div>
            <Link className="text-link" to="/scenarios">
              View library
              <ArrowRight size={15} />
            </Link>
          </div>
          {data.scenarios.length ? (
            <div className="panel recent-scenarios">
              {data.scenarios.slice(0, 4).map((s) => (
                <Link
                  to={"/scenarios/" + s.id}
                  className="recent-row"
                  key={s.id}
                >
                  <span
                    className={
                      "scenario-icon " +
                      (s.office === "front" ? "green" : "sand")
                    }
                  >
                    {s.office === "front" ? (
                      <Headphones size={22} />
                    ) : (
                      <FileCheck2 size={22} />
                    )}
                  </span>
                  <span className="recent-copy">
                    <strong>{s.title}</strong>
                    <small>
                      {data.processes.find((p) => p.id === s.process_id)?.name}{" "}
                      · {s.office === "front" ? "Front office" : "Back office"}
                    </small>
                  </span>
                  <Badge tone={s.published_version ? "success" : "neutral"}>
                    {s.published_version ? "Published" : "Draft"}
                  </Badge>
                  <ChevronRight size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Build your first scenario">
              Upload screenshots and turn a procedure into practice.
            </Empty>
          )}
          <div className="process-note">
            <BookOpen size={20} />
            <div>
              <strong>A good scenario starts with a real task.</strong>
              <p>
                Clear steps and helpful screenshots make practice feel familiar.
              </p>
            </div>
            <Link to="/scenarios/new" aria-label="Create a scenario">
              <ArrowUpRight size={22} />
            </Link>
          </div>
        </section>
        <section>
          <div className="section-head">
            <div>
              <span className="eyebrow">FROM PRACTICE TO READY</span>
              <h2>Team readiness</h2>
            </div>
            <Link className="text-link" to="/progress">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="panel readiness-card">
            <div
              className="readiness-ring"
              style={{
                background:
                  "conic-gradient(var(--green) " + rate + "%, #eaf0ed 0)",
              }}
            >
              <div>
                <strong>{rate}%</strong>
                <span>completed</span>
              </div>
            </div>
            <p>
              {data.assignments.length
                ? "Progress grows with every approved assessment."
                : "Assign a scenario to start tracking team readiness."}
            </p>
            <div className="readiness-legend">
              <span>
                <i className="legend-dot green-dot" />
                {completed} completed
              </span>
              <span>
                <i className="legend-dot" />
                {data.assignments.length - completed} in progress
              </span>
            </div>
            <Link to="/progress" className="button full">
              View progress
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
      {pending.length > 0 && (
        <div className="review-callout">
          <span className="scenario-icon sand">
            <CheckCheck />
          </span>
          <div>
            <strong>
              {pending.length} assessment{pending.length > 1 ? "s are" : " is"}{" "}
              ready for your review.
            </strong>
            <p>Your feedback turns practice into progress.</p>
          </div>
          <Link className="button" to="/reviews">
            Review assessments
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
function GraduationMark() {
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
      <path
        d="M12 34L45 17L78 34L45 51L12 34Z"
        fill="#e9efbc"
        stroke="#e9efbc"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M25 44V62C36 73 54 73 65 62V44"
        stroke="#e9efbc"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M78 36V59"
        stroke="#e9efbc"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
