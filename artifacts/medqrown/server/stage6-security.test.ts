import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const stage6 = readFileSync(new URL("./stage6.ts", import.meta.url), "utf8");

test("class exam access checks both class roster and Active/Grace membership", () => {
  assert.match(routes, /FROM medqrown_class_students WHERE class_id = \$1 AND student_id = \$2/);
  assert.match(routes, /!\["active", "grace"\]\.includes\(membership\.status\)/);
});

test("student result lookup is identity-scoped and only selects submitted attempts", () => {
  const resultRoute = stage6.slice(
    stage6.indexOf('app.get("/api/student/exams/:id/results"'),
  );
  assert.match(resultRoute, /es\.student_id = \$2 AND a\.status = 'submitted'/);
  assert.match(resultRoute, /\[examId, req\.student\.id\]/);
  assert.doesNotMatch(resultRoute, /RANK\(|classAverage|averageScore|studentEmail/);
});

test("server deadline sweep submits attempts without a client request", () => {
  assert.match(stage6, /UPDATE attempts a[\s\S]*a\.status = 'in_progress'/);
  assert.match(stage6, /a\.started_at \+ make_interval\(mins => e\.duration_minutes\)/);
  assert.match(stage6, /e\.closes_at/);
});

test("saved responses are bound to the attempt's current question", () => {
  assert.match(routes, /questionsForAttempt\[attempt\.currentQuestionIndex\]\?\.id !== question\.id/);
});