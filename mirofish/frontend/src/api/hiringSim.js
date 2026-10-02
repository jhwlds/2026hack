import { generateOntology, buildGraph, getTaskStatus, getProject } from './graph'
import {
  createSimulation, prepareSimulation, getPrepareStatus, startSimulation, getRunStatus
} from './simulation'
import { generateReport, getReport } from './report'
import { buildSeedDoc, buildRequirement, pollUntil, MAX_ROUNDS } from '../lib/hiringSim'

const taskFailed = (r) => r.data.status === 'failed' && (r.data.error || r.data.message || 'The task failed.')

// Fills `state` as it goes, so calling again with the same state after a failure skips the finished stages.
export async function runPipeline({ scenario, profiles, state, signal, onStage, maxRounds = MAX_ROUNDS }) {
  const poll = (fn, isDone, isFailed, intervalMs = 2000) => pollUntil(fn, { isDone, isFailed, intervalMs, signal })

  if (!state.projectId) {
    await onStage('ontology')
    const form = new FormData()
    form.append('files', new Blob([buildSeedDoc(scenario, profiles)], { type: 'text/markdown' }), 'scenario.md')
    form.append('simulation_requirement', buildRequirement(scenario))
    form.append('project_name', `hiring-sim: ${scenario.policy.trim().slice(0, 30)}`)
    state.projectId = (await generateOntology(form)).data.project_id
  }

  if (!state.graphId) {
    await onStage('graph')
    const build = await buildGraph({ project_id: state.projectId })
    await poll(() => getTaskStatus(build.data.task_id), r => r.data.status === 'completed', taskFailed)
    state.graphId = (await getProject(state.projectId)).data.graph_id
  }

  if (!state.prepared) {
    await onStage('prepare')
    state.simulationId ||= (await createSimulation({
      project_id: state.projectId,
      graph_id: state.graphId,
      enable_twitter: true,
      enable_reddit: true
    })).data.simulation_id
    const prep = await prepareSimulation({
      simulation_id: state.simulationId,
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
    await poll(
      () => getRunStatus(state.simulationId),
      r => ['completed', 'stopped'].includes(r.data.runner_status),
      r => r.data.runner_status === 'failed' && (r.data.error || 'The simulation failed.'),
      3000
    )
  } catch (e) {
    state.started = false // on retry, restart with force
    throw e
  }

  await onStage('report')
  try {
    state.reportId ||= (await generateReport({ simulation_id: state.simulationId })).data.report_id
    const done = await poll(
      () => getReport(state.reportId),
      r => r.data.status === 'completed',
      r => r.data.status === 'failed' && (r.data.error || 'Report generation failed.'),
      3000
    )
    return { markdown: done.data.markdown_content }
  } catch (e) {
    state.reportId = null // on retry, generate a fresh report
    throw e
  }
}
