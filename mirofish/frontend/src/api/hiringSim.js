import { generateOntology, buildGraph, getTaskStatus, getProject } from './graph'
import {
  createSimulation, prepareSimulation, getPrepareStatus, startSimulation, getRunStatus, closeSimulationEnv, getGraphEntities
} from './simulation'
import { generateReport, getReport, getReportProgress } from './report'
import {
  buildRequirement, buildApplicantsDoc, pickApplicantTypes, countApplicants, pollUntil, runPhase, MAX_ROUNDS
} from '../lib/hiringSim'

const taskFailed = (r) => r.data.status === 'failed' && (r.data.error || r.data.message || 'The task failed.')

// Fills `state` as it goes, so calling again with the same state after a failure skips the finished stages.
export async function runPipeline({ requirement, file, state, signal, onStage, maxRounds = MAX_ROUNDS }) {
  const poll = (fn, isDone, isFailed, intervalMs = 2000) => pollUntil(fn, { isDone, isFailed, intervalMs, signal })

  if (!state.projectId) {
    await onStage('ontology')
    const form = new FormData()
    form.append('files', file, file.name) // the world seed
    form.append('files', new Blob([buildApplicantsDoc()], { type: 'text/markdown' }), 'applicants.md') // a posting has no job seekers in it
    form.append('simulation_requirement', buildRequirement(requirement))
    form.append('project_name', `hiring-sim: ${file.name.slice(0, 30)}`)
    const ontology = (await generateOntology(form)).data
    state.projectId = ontology.project_id
    state.applicantTypes = pickApplicantTypes(ontology.ontology)
  }

  if (!state.graphId) {
    await onStage('graph')
    const build = await buildGraph({ project_id: state.projectId })
    await poll(() => getTaskStatus(build.data.task_id), r => r.data.status === 'completed', taskFailed)
    state.graphId = (await getProject(state.projectId)).data.graph_id
  }

  if (!state.prepared) {
    await onStage('prepare')
    // Agents are created only from entities of the applicant types; with none, the backend fails with a Chinese message.
    if (state.applicantTypes) {
      const { entities } = (await getGraphEntities(state.graphId)).data
      if (!countApplicants(entities, state.applicantTypes)) {
        throw new Error('No individual job seekers were found in the simulated world, so there is nobody to run the discussion. Try again, or add a short description of the job seekers to your file.')
      }
    }
    state.simulationId ||= (await createSimulation({
      project_id: state.projectId,
      graph_id: state.graphId,
      enable_twitter: true,
      enable_reddit: true
    })).data.simulation_id
    const prep = await prepareSimulation({
      simulation_id: state.simulationId,
      entity_types: state.applicantTypes, // undefined (omitted from the JSON) means no filtering
      use_llm_for_profiles: true,
      parallel_profile_count: 5
    })
    if (!prep.data.already_prepared) {
      await poll(
        () => getPrepareStatus({ task_id: prep.data.task_id, simulation_id: state.simulationId }),
        r => ['completed', 'ready'].includes(r.data.status),
        taskFailed
      )
    }
    state.prepared = true
  }

  await onStage('run')
  try {
    if (!state.started) {
      await startSimulation({
        simulation_id: state.simulationId,
        // Only the parallel runner writes the action logs the backend uses to detect completion;
        // the single-platform runners finish but stay "running" forever. The feed still reads reddit only.
        platform: 'parallel',
        max_rounds: maxRounds,
        force: true,
        enable_graph_memory_update: true
      })
      state.started = true
    }
    const runFailed = r => runPhase(r.data) === 'failed' && (r.data.error || 'The simulation failed.')
    const finished = await poll(
      () => getRunStatus(state.simulationId),
      r => ['closing', 'done'].includes(runPhase(r.data)),
      runFailed,
      3000
    )
    if (runPhase(finished.data) === 'closing') {
      // Both platforms are done but the process waits for interview commands; closing the environment lets the run complete.
      await closeSimulationEnv({ simulation_id: state.simulationId, timeout: 60 })
      await poll(() => getRunStatus(state.simulationId), r => runPhase(r.data) === 'done', runFailed, 3000)
    }
  } catch (e) {
    state.started = false // on retry, restart with force
    throw e
  }

  await onStage('report')
  try {
    state.reportId ||= (await generateReport({ simulation_id: state.simulationId })).data.report_id
    // The report only exists (GET /report/:id) once generation has saved it; until then ask for its progress instead.
    const reportInfo = async () => {
      try {
        return await getReport(state.reportId)
      } catch (e) {
        if (e.response?.status !== 404) throw e
        return getReportProgress(state.reportId).catch(() => ({ data: { status: 'pending' } }))
      }
    }
    const done = await poll(
      reportInfo,
      r => r.data.status === 'completed' && !!r.data.markdown_content,
      r => r.data.status === 'failed' && (r.data.error || r.data.message || 'Report generation failed.'),
      3000
    )
    return { markdown: done.data.markdown_content }
  } catch (e) {
    state.reportId = null // on retry, generate a fresh report
    throw e
  }
}
