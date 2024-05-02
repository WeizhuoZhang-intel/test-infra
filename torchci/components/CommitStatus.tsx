import FilteredJobList from "./FilteredJobList";
import VersionControlLinks from "./VersionControlLinks";
import { CommitData, JobData, IssueData } from "lib/types";
import WorkflowBox from "./WorkflowBox";
import styles from "components/commit.module.css";
import _ from "lodash";
import {
  isFailedJob,
  isRerunDisabledTestsJob,
  isUnstableJob,
} from "lib/jobUtils";
import { linkIt, UrlComponent, urlRegex } from "react-linkify-it";
import { getConclusionSeverityForSorting } from "../lib/JobClassifierUtil";
import useScrollTo from "lib/useScrollTo";
import WorkflowDispatcher from "./WorkflowDispatcher";
import { useSession } from "next-auth/react";
import { useState } from "react";

function getBoxOrdering(jobs: JobData[], wideBoxes: Set<string>) {
  const byWorkflow = _(jobs)
    .groupBy((job) => job.workflowName)
    .sortBy(
      (jobs) =>
        _(jobs)
          .map((job) => getConclusionSeverityForSorting(job.conclusion))
          .max(), // put failing workflows first
      (jobs) => jobs.length // put worflows of similar lenghts together to keep the display more compact
    )
    .reverse()
    .value();

  // Next, if a workflow is wide, make sure it is on the left to make shifting
  // less prominent when the workflowbox becomes wide
  const newOrder = [];
  let left = true;
  for (const workflow of byWorkflow) {
    const workflowName = workflow[0].workflowName as string;

    if (wideBoxes.has(workflowName) && !left) {
      const last: JobData[] = newOrder.pop()!;
      newOrder.push(workflow);
      newOrder.push(last);
    } else {
      newOrder.push(workflow);
      if (!wideBoxes.has(workflowName)) {
        left = !left;
      }
    }
  }

  return newOrder;
}

function WorkflowsContainer({
  jobs,
  unstableIssues,
}: {
  jobs: JobData[];
  unstableIssues: IssueData[];
}) {
  useScrollTo();

  const [wideBoxes, setWideBoxes] = useState(new Set<string>());

  if (jobs.length === 0) {
    return null;
  }

  const byWorkflow = getBoxOrdering(jobs, wideBoxes);

  return (
    <>
      <h1>Workflows</h1>
      <div className={styles.workflowContainer}>
        {_.map(byWorkflow, (jobs) => {
          let workflowName = "" + jobs[0].workflowName;
          return (
            <WorkflowBox
              key={workflowName}
              workflowName={workflowName}
              jobs={jobs}
              unstableIssues={unstableIssues}
              wide={wideBoxes.has(workflowName)}
              setWide={(wide: boolean) => {
                if (wide) {
                  setWideBoxes(new Set(wideBoxes).add(workflowName));
                } else {
                  const newSet = new Set(wideBoxes);
                  newSet.delete(workflowName);
                  setWideBoxes(newSet);
                }
              }}
            />
          );
        })}
      </div>
    </>
  );
}

export default function CommitStatus({
  repoOwner,
  repoName,
  commit,
  jobs,
  isCommitPage,
  unstableIssues,
}: {
  repoOwner: string;
  repoName: string;
  commit: CommitData;
  jobs: JobData[];
  isCommitPage: boolean;
  unstableIssues: IssueData[];
}) {
  const session = useSession();
  const isAuthenticated = session.status === "authenticated";

  return (
    <>
      <VersionControlLinks
        githubUrl={commit.commitUrl}
        diffNum={commit.diffNum}
      />

      <article className={styles.commitMessage}>
        {linkIt(
          commit.commitMessageBody,
          (match, key) => (
            <UrlComponent match={match} key={key} />
          ),
          urlRegex
        )}
      </article>
      <FilteredJobList
        filterName="Failed jobs"
        jobs={jobs}
        pred={(job) =>
          isFailedJob(job) &&
          !isRerunDisabledTestsJob(job) &&
          !isUnstableJob(job, unstableIssues)
        }
        showClassification
        unstableIssues={unstableIssues}
      />
      <FilteredJobList
        filterName="Failed unstable jobs"
        jobs={jobs}
        pred={(job) => isFailedJob(job) && isUnstableJob(job, unstableIssues)}
        unstableIssues={unstableIssues}
      />
      <FilteredJobList
        filterName="Daily rerunning disabled jobs"
        jobs={jobs}
        pred={(job) => isFailedJob(job) && isRerunDisabledTestsJob(job)}
        unstableIssues={unstableIssues}
      />
      <FilteredJobList
        filterName="Pending jobs"
        jobs={jobs}
        pred={(job) => job.conclusion === "pending"}
        unstableIssues={unstableIssues}
      />
      <WorkflowsContainer jobs={jobs} unstableIssues={unstableIssues} />
      {isAuthenticated && isCommitPage && (
        <WorkflowDispatcher
          repoOwner={repoOwner}
          repoName={repoName}
          commit={commit}
          jobs={jobs}
          session={session.data}
        />
      )}
    </>
  );
}
