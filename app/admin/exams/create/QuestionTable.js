// app/admin/exams/create/QuestionTable.js  (new file)
//
// Questions as a table. Collapsed rows show only the question; "expand" reveals
// the options and the solution. With `selectable`, a check box sits at the right
// of every row; without it (automatic mode) every row shows a fixed tick.
// With `onRegenerate`, every row also gets a regenerate icon that swaps just that
// one question (`busyIds` = q_ids currently being replaced).
// With `sequential`, rows are numbered 1, 2, 3... in the order given.
"use client";

import { useState } from "react";
import s from "../exams.module.css";
import { sanitizeHtml, useDomPurify } from "./sanitize";
import { RegenIcon } from "./ui";

const LETTERS = ["A", "B", "C", "D"];

function correctLetter(q) {
  const raw = q.answer_key ?? q.correct_option ?? q.correct_answer ?? q.answer;
  const v = String(raw ?? "").trim().toUpperCase();
  return LETTERS.includes(v) ? v : "";
}

export default function QuestionTable({ questions, selectable = false, chosen = [], canPickMore = true, onToggle, onRegenerate, busyIds = {}, changedIds = {}, sequential = false }) {
  useDomPurify();
  const [openId, setOpenId] = useState({}); // { q_id: true }

  const flip = (id) => setOpenId((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className={s.tableWrap}>
      <table className={s.qTable}>
        <thead>
          <tr>
            <th className={s.thNo}>#</th>
            <th>Question</th>
            <th className={s.thId}>ID</th>
            {onRegenerate && <th className={s.thRegen}>Regenerate</th>}
            <th className={s.thCheck}>{selectable ? "Select" : "Included"}</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => {
            const id = q.q_id;
            const isOpen = !!openId[id];
            const on = chosen.includes(id);
            const blocked = selectable && !on && !canPickMore;
            const right = correctLetter(q);
            const busy = !!busyIds[id];
            const changed = !!changedIds[id];
            return (
              <FragmentRows key={id || i}>
                <tr className={`${s.qRow} ${on || !selectable ? s.qRowOn : ""} ${changed ? s.qRowChanged : ""}`} onClick={() => flip(id)}>
                  <td className={s.tdNo}>
                    <span className={s.qChev}>{isOpen ? "\u25BE" : "\u25B8"}</span>
                    {sequential ? i + 1 : (q.test_q_num ?? i + 1)}
                    {changed && <span className={s.newTag}>NEW</span>}
                  </td>
                  <td>
                    <div className={isOpen ? s.qFull : s.qPrev} dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_html) }} />
                  </td>
                  <td className={s.tdId}>{id}</td>
                  {onRegenerate && (
                    <td className={s.tdRegen}>
                      <button
                        type="button"
                        className={`${s.regenBtn} ${busy ? s.regenSpin : ""}`}
                        title="Replace with another random question"
                        aria-label={`Regenerate question ${i + 1}`}
                        disabled={busy}
                        onClick={(e) => { e.stopPropagation(); onRegenerate(q); }}
                      >
                        <RegenIcon />
                      </button>
                    </td>
                  )}
                  <td className={s.tdCheck}>
                    {selectable ? (
                      <button
                        type="button"
                        className={`${s.box} ${s.boxLg} ${on ? s.boxOn : ""} ${blocked ? s.boxOff : ""}`}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Select question ${i + 1}`}
                        disabled={blocked}
                        onClick={(e) => { e.stopPropagation(); onToggle(id); }}
                      >
                        {on ? "\u2713" : ""}
                      </button>
                    ) : (
                      <span className={`${s.box} ${s.boxLg} ${s.boxOn}`}>{"\u2713"}</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className={s.qExpandRow}>
                    <td />
                    <td colSpan={onRegenerate ? 4 : 3}>
                      <div className={s.optList}>
                        {LETTERS.map((L) => (
                          <div key={L} className={`${s.opt} ${right === L ? s.optRight : ""}`}>
                            <span className={s.optLetter}>{L}</span>
                            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.options?.[L]) }} />
                          </div>
                        ))}
                      </div>
                      {right && <div className={s.rightTag}>Correct answer: {right}</div>}
                      <div className={s.solBox}>
                        <div className={s.solLabel}>Solution</div>
                        {q.solution_html ? (
                          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.solution_html) }} />
                        ) : (
                          <div className={s.noteSm}>No solution available for this question.</div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// <tbody> children must be rows; a keyed fragment keeps the two rows together.
function FragmentRows({ children }) {
  return <>{children}</>;
}
