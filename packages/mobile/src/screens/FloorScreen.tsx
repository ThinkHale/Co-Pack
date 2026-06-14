import React, { useCallback, useEffect, useState } from 'react';
import { Image, View, Text, Pressable, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import {
  GameState, Line, Order, Worker, StationSkill, stationRole, orderProfile,
  dayCondition, dayAttendanceModifier,
  mealCost, incentiveCost, mealReady, incentiveReady,
  mealCooldownRemaining, incentiveCooldownRemaining,
  flightRisk, trainingCost, canTrain, effectiveWage, effectiveHourly,
  lineThroughput, dayOfTick, weekday, openObjectives, hasUnlock, UNTRAINED_PROFICIENCY,
  SUPPORT_STATION_ID, SUPPORT_OUTPUT_BONUS,
} from '@copack/engine';
import { colors, radius, shared, STATION_NAMES, STATION_THEMES } from '../theme';
import { formatCurrency, pct, profileForWorker } from '../format';
import { useGameStore, HIRE_COST } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button, StatCell, Bar } from '../components/common';
import { CharacterAvatar, WorkerPortraitStrip, appearanceSummary } from '../components/Avatar';
import { MiniBar } from '../components/MiniBar';
import { TraitChips } from '../components/TraitChips';
import { ConveyorBelt } from '../components/Belt';
import { TUTORIAL_STEPS } from '../components/Overlays';
import { Spotlight } from '../components/Spotlight';

type DayConditionInfo = ReturnType<typeof dayCondition>;
const TONE_COLOR: Record<string, string> = { good: colors.green, bad: colors.red, neutral: colors.cyan };
const TRAINABLE = ['s1', 's2', 's3'];
const LINE_PREVIEW = require('../../assets/floor/line-view-preview.png');

export function FloorScreen({ state }: { state: GameState }) {
  const {
    selectedWorkerId, selectWorker, assignWorker, unassignStation,
    hireWorker, train, buyMeal, runIncentive,
    resolveChallenge, terminateWorker, soundOn, paused, setTab,
    tutorialActive, tutorialStep, advanceTutorial,
  } = useGameStore();
  const tutTarget = tutorialActive ? TUTORIAL_STEPS[tutorialStep]?.target : undefined;

  const awaitingStaffing = state.awaitingStaffing;
  const gameOver = state.gameOver;
  const shiftActive = !awaitingStaffing && !gameOver;
  const condition = dayCondition(state.day);
  const workers = Object.values(state.workers);
  const assignedIds = new Set(
    Object.values(state.lines).flatMap((l) => [
      ...(l.stations.map((s) => s.assignedWorkerId).filter(Boolean) as string[]),
      ...(l.supportWorkerIds ?? []),
    ])
  );
  const benchWorkers = workers.filter((w) => !assignedIds.has(w.id));
  const selectedWorker = selectedWorkerId ? state.workers[selectedWorkerId] : null;

  const confirmTerminate = useCallback((worker: Worker) => {
    const missed = worker.missedShifts ?? 0;
    const sentHome = worker.sentHomeShifts ?? 0;
    Alert.alert(
      `Terminate ${worker.name}?`,
      `They have missed ${missed} shift${missed === 1 ? '' : 's'} and been sent home ${sentHome} time${sentHome === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Terminate', style: 'destructive', onPress: () => terminateWorker(worker.id) },
      ]
    );
  }, [terminateWorker]);

  // Station-first staffing: tap an empty station → pick from a best-fit list
  // right there. Kills the bench↔station scroll round-trips on big floors.
  const [picker, setPicker] = useState<{ lineId: string; stationId: string; stationName: string; role: string } | null>(null);
  const pickerCandidates = picker
    ? benchWorkers
        .filter((w) => w.presentThisShift)
        .map((w) => ({
          worker: w,
          prof: w.skills.find((sk: StationSkill) => sk.stationId === picker.role)?.proficiency ?? null,
        }))
        .sort((a, b) => (b.prof ?? UNTRAINED_PROFICIENCY) - (a.prof ?? UNTRAINED_PROFICIENCY))
    : [];

  // First-play tutorial: do-it-to-advance, watching the live floor state.
  const staffedCount = Object.values(state.lines).reduce(
    (n, l) => n + l.stations.filter((s) => s.assignedWorkerId).length, 0);
  const tutorialAuto = tutorialActive && TUTORIAL_STEPS[tutorialStep]?.auto;
  useEffect(() => {
    if (!tutorialAuto) return;
    if (tutorialAuto({ selected: selectedWorkerId, staffed: staffedCount, shiftRunning: !awaitingStaffing && state.tick > 1 })) {
      advanceTutorial();
    }
  }, [tutorialAuto, selectedWorkerId, staffedCount, awaitingStaffing, state.tick, advanceTutorial]);

  return (
    <View style={{ gap: 14 }}>
      {/* The tutorial card + standup bar are pinned above the scroll view in
          App.tsx (FloorPinned) so they don't scroll away while staffing. */}
      <Spotlight active={tutTarget === 'goal'} radius={radius.md}>
        <NextGoalStrip state={state} onGoTo={() => setTab('orders')} />
      </Spotlight>

      {state.shiftChallenge && (
        <ShiftChallengeCard challenge={state.shiftChallenge} onResolve={resolveChallenge} />
      )}

      {selectedWorker && (
        <WorkerActionBar
          worker={selectedWorker}
          cash={state.cash}
          payPolicy={state.payPolicy}
          onTrain={train}
          onTerminate={confirmTerminate}
          onCancel={() => selectWorker(null)}
        />
      )}

      {/* Lines first — staffing is the floor's job; ambient info reads below. */}
      {Object.entries(state.lines).map(([lineId, line]) => (
        <FloorLine
          key={lineId}
          lineId={lineId}
          line={line}
          workers={state.workers}
          lineRate={lineThroughput(state, line)}
          runningOrder={state.activeOrders.find((o) => o.id === line.orderId)}
          shiftActive={shiftActive}
          paused={paused}
          supportLocked={!hasUnlock(state, 'support')}
          highlightEmpty={tutTarget === 'stations'}
          selectedWorker={selectedWorker}
          onSelectWorker={selectWorker}
          onAssign={assignWorker}
          onUnassign={unassignStation}
          onOpenPicker={(stationId, stationName, role) => setPicker({ lineId, stationId, stationName, role })}
        />
      ))}

      <ConditionsBar
        condition={condition}
        swing={dayAttendanceModifier(state)}
        mealActive={state.mealToday}
        incentiveActive={state.incentiveToday}
        mealReady={mealReady(state)}
        incentiveReady={incentiveReady(state)}
        mealCooldown={mealCooldownRemaining(state)}
        incentiveCooldown={incentiveCooldownRemaining(state)}
        mealCost={mealCost(state)}
        incentiveCost={incentiveCost(state)}
        cash={state.cash}
        onMeal={buyMeal}
        onIncentive={runIncentive}
      />

      {state.lastShiftReport && <ShiftImpactPanel report={state.lastShiftReport} />}

      <CrewBench
        benchWorkers={benchWorkers}
        selectedWorkerId={selectedWorkerId}
        cash={state.cash}
        onHire={hireWorker}
        onSelectWorker={selectWorker}
        onTerminate={confirmTerminate}
      />

      {/* Best-fit picker for the tapped station. */}
      <Modal transparent visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.pickerScrim} onPress={() => setPicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Staff {picker?.stationName ?? 'station'}</Text>
            <Text style={styles.pickerSub}>Best fit first · untrained workers run at {Math.round(UNTRAINED_PROFICIENCY * 100)}%</Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
              {pickerCandidates.length === 0 && (
                <Text style={styles.pickerEmpty}>Nobody available — everyone present is already placed. Hire, or pull someone off another station.</Text>
              )}
              {pickerCandidates.map(({ worker, prof }) => (
                <Pressable
                  key={worker.id}
                  onPress={() => {
                    if (picker) assignWorker(worker.id, picker.lineId, picker.stationId);
                    setPicker(null);
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.8 }]}
                >
                  <CharacterAvatar worker={worker} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName} numberOfLines={1}>{worker.name}</Text>
                    <Text style={shared.bodyMute} numberOfLines={1}>
                      Mood {pct(worker.morale)} · Trust {pct(worker.reliability)}
                    </Text>
                  </View>
                  <Text style={[styles.pickerProf, { color: prof != null ? colors.green : colors.textMute }]}>
                    {prof != null ? pct(prof) : 'untrained'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button label="Cancel" tone="ghost" onPress={() => setPicker(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// --- Next goal: one slim line of pull at the top of the Floor ----------------

function NextGoalStrip({ state, onGoTo }: { state: GameState; onGoTo: () => void }) {
  const next = openObjectives(state, 1)[0];
  if (!next) return null;
  const prog = next.progress?.(state);
  const ratio = prog ? Math.min(1, prog.current / prog.target) : null;
  return (
    <Pressable onPress={onGoTo} style={({ pressed }) => [styles.goalStrip, pressed && { opacity: 0.85 }]}>
      <View style={styles.rowBetween}>
        <Text style={styles.goalEyebrow}>Next goal</Text>
        <Text style={styles.goalReward}>+{formatCurrency(next.reward)}</Text>
      </View>
      <Text style={styles.goalLabel} numberOfLines={1}>{next.label}</Text>
      {ratio !== null && (
        <View style={{ marginTop: 6 }}>
          <Bar value={Math.max(ratio, 0.04)} color={colors.gold} height={5} />
        </View>
      )}
    </Pressable>
  );
}

// --- Conditions + break-glass levers ----------------------------------------

function ConditionsBar({
  condition, swing, mealActive, incentiveActive, mealReady: mReady, incentiveReady: iReady,
  mealCooldown, incentiveCooldown, mealCost: mCost, incentiveCost: iCost, cash, onMeal, onIncentive,
}: {
  condition: DayConditionInfo; swing: number;
  mealActive: boolean; incentiveActive: boolean; mealReady: boolean; incentiveReady: boolean;
  mealCooldown: number; incentiveCooldown: number; mealCost: number; incentiveCost: number;
  cash: number; onMeal: () => void; onIncentive: () => void;
}) {
  const accent = TONE_COLOR[condition.tone] ?? colors.cyan;
  const swingPct = Math.round(swing * 100);
  const lever = (active: boolean, cooldown: number, name: string, cost: number) =>
    active ? `${name} on today` : cooldown > 0 ? `${name} · ${cooldown}d` : `${name} ${formatCurrency(cost)}`;

  return (
    <Panel>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={[styles.orb, { backgroundColor: accent }]} />
          <View style={{ flex: 1 }}>
            <Eyebrow>Today on the floor</Eyebrow>
            <Text style={styles.condTitle} numberOfLines={1}>{condition.label}</Text>
            <Text style={shared.bodyMute} numberOfLines={2}>{condition.note}</Text>
          </View>
        </View>
        <Pill color={swing < 0 ? colors.red : swing > 0 ? colors.green : colors.textMute}>
          Att {swingPct > 0 ? '+' : ''}{swingPct}%
        </Pill>
      </View>
      <Text style={[styles.leverLabel, { marginTop: 12 }]}>Break-glass · big cost, then cools down</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Button
          label={lever(mealActive, mealCooldown, 'Meal', mCost)}
          tone={mealActive ? 'accent' : 'muted'}
          disabled={!mReady || cash < mCost}
          onPress={onMeal}
          style={{ flex: 1 }}
        />
        <Button
          label={lever(incentiveActive, incentiveCooldown, 'Incentive', iCost)}
          tone={incentiveActive ? 'accent' : 'muted'}
          disabled={!iReady || cash < iCost}
          onPress={onIncentive}
          style={{ flex: 1 }}
        />
      </View>
    </Panel>
  );
}

// --- Last-shift people impact -----------------------------------------------

// Collapsed by default — the one-line summary keeps the signal and the floor
// uncluttered; the per-person detail is one tap away. Mirrors the web panel.
function ShiftImpactPanel({ report }: { report: NonNullable<GameState['lastShiftReport']> }) {
  const [open, setOpen] = useState(false);
  const ordered = [...report.workerImpacts].sort((a, b) => {
    const rank = { sent_home: 0, no_show: 1, worked: 2 } as const;
    return rank[a.status] - rank[b.status] || b.units - a.units;
  });
  const statusLabel = (s: typeof ordered[number]['status']) =>
    s === 'worked' ? 'Worked' : s === 'sent_home' ? 'Sent home' : 'No-show';
  const statusColor = (s: typeof ordered[number]['status']) =>
    s === 'worked' ? colors.green : s === 'sent_home' ? colors.amber : colors.red;

  return (
    <Panel>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.rowBetween}>
        <View>
          <Eyebrow>Last shift {open ? '▾' : '▸'}</Eyebrow>
          <Text style={shared.h2}>People Impact</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.bigScore}>{Math.round(report.totalUnits)}</Text>
          <Text style={shared.bodyMute}>units · {formatCurrency(report.payroll)}</Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <StatCell label="Worked" value={`${report.workedCount}`} tone={colors.green} />
        <StatCell label="Sent home" value={`${report.sentHomeCount}`} tone={colors.amber} />
        <StatCell label="No-show" value={`${report.noShowCount}`} tone={colors.red} />
      </View>
      {open && <View style={{ marginTop: 10, gap: 6 }}>
        {ordered.map((w) => (
          <View key={w.workerId} style={styles.impactRow}>
            <View style={[styles.impactDot, { backgroundColor: statusColor(w.status) }]} />
            <Text style={styles.impactStatus}>{statusLabel(w.status)}</Text>
            <Text style={styles.impactName} numberOfLines={1}>{w.workerName}</Text>
            <Text style={styles.impactMeta} numberOfLines={1}>
              {w.status === 'worked'
                ? `${w.stationName ?? 'Floor'} · ${w.units.toFixed(1)}u`
                : w.status === 'sent_home' ? 'No pay' : `${w.missedShifts} missed`}
            </Text>
          </View>
        ))}
      </View>}
    </Panel>
  );
}

// --- Mid-shift challenge ------------------------------------------------------

function ShiftChallengeCard({
  challenge, onResolve,
}: { challenge: NonNullable<GameState['shiftChallenge']>; onResolve: (id: string) => void }) {
  return (
    <Panel style={{ borderColor: colors.amber }}>
      <Eyebrow color={colors.amber}>Floor decision</Eyebrow>
      <Text style={[shared.h2, { marginTop: 2 }]}>{challenge.title}</Text>
      <Text style={[shared.body, { marginTop: 4 }]}>{challenge.note}</Text>
      <View style={{ gap: 8, marginTop: 12 }}>
        {challenge.choices.map((c) => (
          <Pressable key={c.id} onPress={() => onResolve(c.id)} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.85 }]}>
            <Text style={styles.choiceLabel}>{c.label}</Text>
            <Text style={styles.choiceNote}>{c.note}</Text>
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}

// --- Selected-worker action bar (train / terminate) -------------------------

function WorkerActionBar({
  worker, cash, payPolicy, onTrain, onTerminate, onCancel,
}: {
  worker: Worker; cash: number; payPolicy: GameState['payPolicy'];
  onTrain: (workerId: string, stationId: string) => void;
  onTerminate: (worker: Worker) => void;
  onCancel: () => void;
}) {
  const profile = profileForWorker(worker);
  const risk = flightRisk(worker, payPolicy);
  const riskColor = risk === 'high' ? colors.red : risk === 'watch' ? colors.amber : colors.green;
  const riskCopy = risk === 'high' ? 'Flight risk — morale low' : risk === 'watch' ? 'Watch morale' : 'Settled in';

  return (
    <Panel style={styles.workerSheet}>
      <View style={styles.sheetHandle} />
      <View style={styles.profileTop}>
        <CharacterAvatar worker={worker} size="lg" />
        <View style={{ flex: 1 }}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Eyebrow color={colors.inkMute}>Selected worker</Eyebrow>
              <Text style={styles.profileName} numberOfLines={1}>{worker.name}</Text>
            </View>
            <Button label="Close" tone="ghost" small onPress={onCancel} />
          </View>
          <Text style={[styles.profileMeta, { color: riskColor }]}>
            {riskCopy} · ${effectiveHourly(worker, payPolicy).toFixed(2)}/hr ({formatCurrency(effectiveWage(worker, payPolicy))}/shift)
          </Text>
          <View style={styles.profilePills}>
            <Pill color={colors.teal}>D{worker.tenureDays}</Pill>
            {worker.isLead && <Pill color={colors.gold}>Lead</Pill>}
            {worker.permanent && <Pill color={colors.purple}>Company</Pill>}
          </View>
        </View>
      </View>

      <View style={styles.profileStats}>
        <ProfileStat label="Mood" value={worker.morale} color={colors.gold} />
        <ProfileStat label="Trust" value={worker.reliability} color={colors.teal} />
      </View>

      <View style={styles.appearanceRow}>
        <WorkerPortraitStrip worker={worker} />
        <Text style={styles.appearanceText} numberOfLines={1}>{appearanceSummary(worker)}</Text>
      </View>

      <TraitChips worker={worker} style={{ marginTop: 10 }} />
      <Text style={styles.assignHint}>Tap a station target to assign. Train here when someone needs a new role.</Text>

      <View style={styles.trainingGrid}>
        {TRAINABLE.map((sid) => {
          const skill = worker.skills.find((s) => s.stationId === sid);
          const cost = trainingCost(worker, sid);
          const trainable = canTrain(worker, sid) && cash >= cost;
          return (
            <Pressable
              key={sid}
              disabled={!trainable}
              onPress={() => onTrain(worker.id, sid)}
              style={({ pressed }) => [styles.trainBtn, !trainable && { opacity: 0.4 }, pressed && trainable && { opacity: 0.8 }]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.trainStation}>{STATION_NAMES[sid]}</Text>
                <Text style={styles.trainCost}>{formatCurrency(cost)}</Text>
              </View>
              <Bar value={skill?.proficiency ?? 0.08} color={STATION_THEMES[sid]?.color ?? colors.teal} height={5} track="rgba(16,20,23,0.08)" />
              <Text style={styles.trainProf}>{skill ? pct(skill.proficiency) : 'New skill'}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
        <Button label="Terminate" tone="danger" small onPress={() => onTerminate(worker)} />
      </View>
    </Panel>
  );
}

function ProfileStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.profileStat}>
      <View style={styles.rowBetween}>
        <Text style={styles.profileStatLabel}>{label}</Text>
        <Text style={styles.profileStatValue}>{pct(value)}</Text>
      </View>
      <Bar value={value} color={color} height={6} track="rgba(16,20,23,0.1)" />
    </View>
  );
}

// --- A production line with its stations -------------------------------------

function FloorLine({
  lineId, line, workers, lineRate, runningOrder, shiftActive, paused, supportLocked, highlightEmpty, selectedWorker, onSelectWorker, onAssign, onUnassign, onOpenPicker,
}: {
  lineId: string; line: Line; workers: Record<string, Worker>; lineRate: number; runningOrder?: Order;
  shiftActive: boolean; paused: boolean; supportLocked: boolean; highlightEmpty: boolean; selectedWorker: Worker | null;
  onSelectWorker: (id: string | null) => void;
  onAssign: (workerId: string, lineId: string, stationId: string) => void;
  onUnassign: (lineId: string, stationId: string) => void;
  onOpenPicker: (stationId: string, stationName: string, role: string) => void;
}) {
  const presentCount = line.stations.filter((s) => s.assignedWorkerId && workers[s.assignedWorkerId]?.presentThisShift).length;
  const isStopped = presentCount === 0;
  const isShort = presentCount > 0 && presentCount < line.stations.length;
  // Paused freezes the belt (the sim clock is stopped) without flipping the
  // status text into its morning "Ready/Staff" state.
  const running = shiftActive && !isStopped && !paused;
  const supportWorkerId = line.supportWorkerIds?.[0];
  const supportWorker = supportWorkerId ? workers[supportWorkerId] : null;

  const statusText = !shiftActive && presentCount > 0
    ? `Ready ${presentCount}/${line.stations.length}`
    : !shiftActive
      ? `Staff ${presentCount}/${line.stations.length}`
      : isStopped ? `Idle · 0/${line.stations.length}`
      : isShort ? `Short ${presentCount}/${line.stations.length} · ${lineRate.toFixed(1)}/min`
      : `Running · ${lineRate.toFixed(1)}/min`;
  const statusColor = !shiftActive && presentCount > 0 ? colors.cyan
    : isStopped ? colors.red : isShort ? colors.amber : colors.green;

  return (
    <Panel style={styles.lineBoard}>
      <View style={[styles.rowBetween, { marginBottom: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pill color={colors.ink} filled>{line.name}</Pill>
          {runningOrder && (
            <Pill color={colors.gold}>{runningOrder.sku} · {orderProfile(runningOrder).short}</Pill>
          )}
          {line.automation > 0 && <Pill color={colors.cyan}>Auto L{line.automation}</Pill>}
          {line.leadId && workers[line.leadId] && <Pill color={colors.gold}>LEAD</Pill>}
        </View>
        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '900' }}>{statusText}</Text>
      </View>

      <View style={styles.segmented}>
        <View style={styles.segmentActive}><Text style={styles.segmentActiveText}>Board</Text></View>
        <View style={styles.segmentIdle}><Text style={styles.segmentIdleText}>Line View</Text></View>
      </View>

      <LinePreview running={running} rate={lineRate} />

      <View style={styles.stationGrid}>
        {line.stations.map((station) => {
          const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
          const present = worker?.presentThisShift ?? false;
          const role = stationRole(station);
          const isMatch = selectedWorker?.skills.some((sk) => sk.stationId === role) ?? false;
          return (
            <StationTile
              key={station.id}
              stationName={station.name}
              stationId={station.id}
              role={role}
              worker={worker}
              present={present}
              working={present && running}
              hasTarget={selectedWorker !== null}
              isMatch={isMatch}
              highlight={highlightEmpty && !worker}
              selectedFirstName={selectedWorker ? profileForWorker(selectedWorker).firstName : null}
              onPress={() => {
                if (selectedWorker) onAssign(selectedWorker.id, lineId, station.id);
                else if (worker) onSelectWorker(worker.id);
                // Empty station, nothing picked up: staff from right here.
                else onOpenPicker(station.id, station.name, role);
              }}
              onClear={() => onUnassign(lineId, station.id)}
            />
          );
        })}
      </View>

      {/* Takeaway belt below the stations — cartons get packed and taped as
          they pass each zone, mirroring the web floor. */}
      <View style={{ marginTop: 10 }}>
        <ConveyorBelt
          running={running}
          rate={lineRate}
          zones={line.stations.length}
          outlet={running ? undefined : isStopped && shiftActive ? 'STALLED' : '—'}
        />
      </View>

      <SupportSlot
        locked={supportLocked}
        worker={supportWorker}
        present={supportWorker?.presentThisShift ?? false}
        working={(supportWorker?.presentThisShift ?? false) && running}
        hasTarget={selectedWorker !== null}
        selectedFirstName={selectedWorker ? profileForWorker(selectedWorker).firstName : null}
        onPress={() => {
          if (selectedWorker) onAssign(selectedWorker.id, lineId, SUPPORT_STATION_ID);
          else if (supportWorker) onSelectWorker(supportWorker.id);
        }}
        onClear={() => onUnassign(lineId, SUPPORT_STATION_ID)}
      />
    </Panel>
  );
}

function LinePreview({ running, rate }: { running: boolean; rate: number }) {
  return (
    <View style={styles.linePreview}>
      <Image source={LINE_PREVIEW} style={styles.linePreviewImage} resizeMode="cover" />
      <View style={styles.linePreviewOverlay}>
        <View>
          <Text style={styles.linePreviewLabel}>Linear line view</Text>
          <Text style={styles.linePreviewMeta}>{running ? 'Running' : 'Boarding'} · {rate.toFixed(1)} units/min</Text>
        </View>
        <View style={[styles.linePulse, { backgroundColor: running ? colors.green : colors.amber }]} />
      </View>
    </View>
  );
}

function StationTile({
  stationName, stationId, role, worker, present, working, hasTarget, isMatch, highlight, selectedFirstName, onPress, onClear,
}: {
  stationName: string; stationId: string; role: string; worker: Worker | null;
  present: boolean; working: boolean; hasTarget: boolean; isMatch: boolean; highlight: boolean;
  selectedFirstName: string | null; onPress: () => void; onClear: () => void;
}) {
  const theme = STATION_THEMES[role] ?? STATION_THEMES.s1;
  const borderColor = isMatch ? colors.green : hasTarget ? theme.color : worker && !present ? colors.red : colors.border;
  return (
    <Spotlight active={highlight} radius={radius.md} style={{ flex: 1 }}>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.station, { borderColor }, pressed && { opacity: 0.85 }]}>
      <View style={styles.stationTop}>
        <View style={[styles.stationCode, { backgroundColor: theme.color }]}>
          <Text style={styles.stationCodeText}>{theme.icon}</Text>
        </View>
        <Text style={styles.stationNameTag} numberOfLines={1}>{stationName}</Text>
        {worker && (
          <Pressable hitSlop={8} onPress={onClear}><Text style={styles.stationClear}>✕</Text></Pressable>
        )}
      </View>
      <View style={styles.stationBody}>
        {worker ? (
          <>
            <CharacterAvatar worker={worker} size="sm" />
            <Text style={styles.stationName} numberOfLines={1}>{profileForWorker(worker).firstName}</Text>
            <Text style={{ color: present ? colors.green : colors.red, fontSize: 10, fontWeight: '900' }}>
              {present ? (working ? 'Working' : 'On deck') : 'No-show'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.emptyIcon}>{theme.note}</Text>
            <Text style={{ color: isMatch ? colors.green : hasTarget ? colors.teal : colors.inkMute, fontSize: 11, fontWeight: '800', textAlign: 'center' }}>
              {hasTarget ? (isMatch ? `${selectedFirstName ?? 'Crew'} fits` : `Place ${selectedFirstName ?? 'crew'}`) : 'Tap to staff'}
            </Text>
          </>
        )}
      </View>
      {worker && <MiniBar label="Mood" value={worker.morale} color={present ? colors.green : colors.red} />}
    </Pressable>
    </Spotlight>
  );
}

function SupportSlot({
  locked, worker, present, working, hasTarget, selectedFirstName, onPress, onClear,
}: {
  locked: boolean; worker: Worker | null; present: boolean; working: boolean; hasTarget: boolean;
  selectedFirstName: string | null; onPress: () => void; onClear: () => void;
}) {
  // The Floater program is a purchased unlock — show the slot, sell the dream.
  if (locked) {
    return (
      <View style={[styles.support, { opacity: 0.55 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.supportLabel}>Support 🔒</Text>
          <Text style={styles.supportTitle} numberOfLines={1}>Floater program locked</Text>
          <Text style={shared.bodyMute} numberOfLines={1}>
            Unlock in Office → Upgrades · +{Math.round(SUPPORT_OUTPUT_BONUS * 100)}% lift
          </Text>
        </View>
      </View>
    );
  }
  const profile = worker ? profileForWorker(worker) : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.support, working && { borderColor: colors.teal }, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.supportLabel}>Support</Text>
        <Text style={styles.supportTitle} numberOfLines={1}>
          {worker && profile ? `${profile.firstName} helping` : hasTarget ? `Add ${selectedFirstName ?? 'helper'}` : 'Overstaff line'}
        </Text>
        <Text style={styles.supportMeta} numberOfLines={1}>
          {worker ? `${present ? 'Paid helper' : 'No-show'} · +${Math.round(SUPPORT_OUTPUT_BONUS * 100)}% lift` : 'Paid helper slot'}
        </Text>
      </View>
      {worker && <CharacterAvatar worker={worker} size="sm" />}
      {worker && <Pressable hitSlop={8} onPress={onClear}><Text style={styles.stationClear}>✕</Text></Pressable>}
    </Pressable>
  );
}

// --- Crew bench --------------------------------------------------------------

// Collapsed by default: with the crew dock + station picker handling staffing,
// this panel is for management (traits, history, terminate) — not the main flow.
function CrewBench({
  benchWorkers, selectedWorkerId, cash, onHire, onSelectWorker, onTerminate,
}: {
  benchWorkers: Worker[]; selectedWorkerId: string | null; cash: number;
  onHire: () => void; onSelectWorker: (id: string | null) => void; onTerminate: (worker: Worker) => void;
}) {
  const [open, setOpen] = useState(benchWorkers.length <= 3);
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen((o) => !o)}>
          <Eyebrow>Crew bench {open ? '▾' : '▸'}</Eyebrow>
          <Text style={shared.h2}>{benchWorkers.length === 0 ? 'All Deployed' : `${benchWorkers.length} on the bench`}</Text>
          <Text style={[shared.bodyMute, { marginTop: 2 }]}>Present crew left here go home unpaid and lose morale.</Text>
        </Pressable>
        <Button label={`Hire ${formatCurrency(HIRE_COST)}`} tone="primary" disabled={cash < HIRE_COST} onPress={onHire} />
      </View>
      {open && <View style={{ gap: 10, marginTop: 12 }}>
        {benchWorkers.length === 0 ? (
          <Text style={styles.emptyBench}>Every available worker is already on the floor.</Text>
        ) : benchWorkers.map((worker) => (
          <BenchWorker
            key={worker.id}
            worker={worker}
            selected={selectedWorkerId === worker.id}
            onSelect={() => onSelectWorker(worker.id)}
            onTerminate={() => onTerminate(worker)}
          />
        ))}
      </View>}
    </Panel>
  );
}

function BenchWorker({
  worker, selected, onSelect, onTerminate,
}: { worker: Worker; selected: boolean; onSelect: () => void; onTerminate: () => void }) {
  const profile = profileForWorker(worker);
  const absent = !worker.presentThisShift;
  const risk = flightRisk(worker);
  return (
    <Pressable
      onPress={absent ? undefined : onSelect}
      disabled={absent}
      style={({ pressed }) => [
        styles.crewCard,
        { borderColor: selected ? profile.palette : colors.border },
        absent && { opacity: 0.5 },
        pressed && !absent && { opacity: 0.85 },
      ]}
    >
      <CharacterAvatar worker={worker} />
      <View style={{ flex: 1 }}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={styles.crewName} numberOfLines={1}>{profile.firstName}</Text>
            {absent ? <Pill color={colors.red}>No-show</Pill> : risk !== 'low' && (
              <Pill color={risk === 'high' ? colors.red : colors.amber}>{risk === 'high' ? 'Flight risk' : 'Watch'}</Pill>
            )}
          </View>
          <Text style={shared.bodyMute}>D{worker.tenureDays}</Text>
        </View>
        <Text style={shared.bodyMute} numberOfLines={1}>{worker.name} / {profile.role}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <MiniBar label="Mood" value={worker.morale} color={colors.gold} />
          <MiniBar label="Trust" value={worker.reliability} color={colors.cyan} />
        </View>
        <View style={styles.pillWrap}>
          <Pill>Missed {worker.missedShifts ?? 0}</Pill>
          <Pill>Home {worker.sentHomeShifts ?? 0}</Pill>
          <Pill>{Math.round(worker.totalUnits ?? 0)}u</Pill>
          {worker.skills.map((sk) => (
            <Pill key={sk.stationId} color={colors.sky}>{STATION_NAMES[sk.stationId] ?? sk.stationId} {pct(sk.proficiency)}</Pill>
          ))}
        </View>
        <TraitChips worker={worker} style={{ marginTop: 8 }} />
        <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
          <Button label="Terminate" tone="danger" small onPress={onTerminate} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalStrip: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  goalEyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  goalReward: { color: colors.green, fontSize: 12, fontWeight: '900' },
  goalLabel: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  banner: { borderWidth: 1.5 },
  bannerOut: { color: colors.pinkSoft, fontSize: 11, fontWeight: '700' },
  bannerStations: { color: colors.textDim, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8 },
  bannerWarn: { color: colors.gold, fontSize: 11, fontWeight: '700', marginTop: 4 },
  bannerActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  orb: { width: 14, height: 14, borderRadius: 7 },
  condTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  leverLabel: { color: colors.textMute, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  bigScore: { color: colors.text, fontSize: 28, fontWeight: '900', lineHeight: 30 },
  impactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
  impactDot: { width: 8, height: 8, borderRadius: 4 },
  impactStatus: { color: colors.textDim, fontSize: 11, fontWeight: '900', width: 66 },
  impactName: { color: colors.text, fontSize: 12, fontWeight: '700', flex: 1 },
  impactMeta: { color: colors.textMute, fontSize: 11, fontWeight: '700' },
  choice: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: 12 },
  choiceLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  choiceNote: { color: colors.textMute, fontSize: 12, fontWeight: '600', marginTop: 2 },
  workerSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.gold,
    borderWidth: 1.5,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 4,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(16,20,23,0.18)',
    marginBottom: 12,
  },
  profileTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  profileName: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 1 },
  profileMeta: { fontSize: 12, fontWeight: '800', marginTop: 3 },
  profilePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  profileStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  profileStat: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkBorder,
    padding: 9,
    gap: 6,
  },
  profileStatLabel: { color: colors.inkMute, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  profileStatValue: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  appearanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  appearanceText: { color: colors.inkDim, fontSize: 11, fontWeight: '800', flex: 1, textTransform: 'capitalize' },
  assignHint: { color: colors.inkDim, fontSize: 12, fontWeight: '700', lineHeight: 16, marginTop: 10 },
  trainingGrid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  trainBtn: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkBorder,
    padding: 8,
    gap: 6,
  },
  trainStation: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  trainProf: { color: colors.inkMute, fontSize: 10, fontWeight: '800' },
  trainCost: { color: colors.inkDim, fontSize: 10, fontWeight: '900' },
  lineBoard: {
    backgroundColor: colors.surface,
    borderColor: colors.inkBorder,
    borderWidth: 1,
  },
  segmented: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkBorder,
    padding: 2,
    marginBottom: 10,
  },
  segmentActive: { backgroundColor: colors.ink, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 6 },
  segmentIdle: { paddingHorizontal: 12, paddingVertical: 6 },
  segmentActiveText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
  segmentIdleText: { color: colors.inkMute, fontSize: 11, fontWeight: '900' },
  linePreview: {
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkBorder,
    backgroundColor: colors.rail,
    minHeight: 118,
  },
  linePreviewImage: { width: '100%', height: 126 },
  linePreviewOverlay: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(9,12,14,0.72)',
  },
  linePreviewLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  linePreviewMeta: { color: colors.textMute, fontSize: 10, fontWeight: '800', marginTop: 1 },
  linePulse: { width: 10, height: 10, borderRadius: 5 },
  stationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  station: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.sm, borderWidth: 1.5, padding: 8, gap: 6, minHeight: 132 },
  stationTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stationCode: { width: 22, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  stationCodeText: { color: colors.bgDeep, fontSize: 9, fontWeight: '900' },
  stationNameTag: { color: colors.inkDim, fontSize: 10, fontWeight: '900', flex: 1 },
  stationClear: { color: colors.inkMute, fontSize: 13, fontWeight: '900', paddingHorizontal: 2 },
  stationBody: { alignItems: 'center', gap: 3, flex: 1, justifyContent: 'center' },
  stationName: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  emptyIcon: { color: colors.inkMute, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  support: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, backgroundColor: colors.paper, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.inkBorder, padding: 10 },
  supportLabel: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  supportTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 1 },
  supportMeta: { color: colors.inkMute, fontSize: 12, fontWeight: '700', marginTop: 1 },
  emptyBench: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 18 },
  pickerScrim: { flex: 1, backgroundColor: 'rgba(7,19,27,0.7)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.panel, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, padding: 16, paddingBottom: 28 },
  pickerTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  pickerSub: { color: colors.textMute, fontSize: 11, fontWeight: '700', marginTop: 2 },
  pickerEmpty: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 16 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
  pickerName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  pickerProf: { fontSize: 13, fontWeight: '900' },
  crewCard: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1.5, padding: 10 },
  crewName: { color: colors.text, fontSize: 17, fontWeight: '900' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
