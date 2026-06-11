import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import {
  GameState, Line, Worker,
  dayCondition, dayAttendanceModifier,
  mealCost, incentiveCost, mealReady, incentiveReady,
  mealCooldownRemaining, incentiveCooldownRemaining,
  canRepeatStaffing, flightRisk, trainingCost, canTrain, effectiveWage,
  lineThroughput, dayOfTick, weekday,
  SUPPORT_STATION_ID, SUPPORT_OUTPUT_BONUS,
} from '@copack/engine';
import { colors, radius, shared, STATION_NAMES, STATION_THEMES } from '../theme';
import { formatCurrency, pct, profileForWorker } from '../format';
import { useGameStore, HIRE_COST } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button, StatCell } from '../components/common';
import { CharacterAvatar } from '../components/Avatar';
import { MiniBar } from '../components/MiniBar';
import { TraitChips } from '../components/TraitChips';
import { ConveyorBelt } from '../components/Belt';

type DayConditionInfo = ReturnType<typeof dayCondition>;
const TONE_COLOR: Record<string, string> = { good: colors.green, bad: colors.red, neutral: colors.cyan };
const TRAINABLE = ['s1', 's2', 's3'];

export function FloorScreen({ state }: { state: GameState }) {
  const {
    selectedWorkerId, selectWorker, assignWorker, unassignStation,
    hireWorker, train, buyMeal, runIncentive, repeatStaffing, startShift,
    resolveChallenge, terminateWorker, soundOn, autoFillCrew,
  } = useGameStore();

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

  return (
    <View style={{ gap: 14 }}>
      {awaitingStaffing && (
        <MorningBanner
          state={state}
          condition={condition}
          canRepeat={canRepeatStaffing(state)}
          hasSupervisor={state.hasSupervisor}
          onAutoFill={autoFillCrew}
          onRepeat={repeatStaffing}
          onStart={startShift}
        />
      )}

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

      {Object.entries(state.lines).map(([lineId, line]) => (
        <FloorLine
          key={lineId}
          lineId={lineId}
          line={line}
          workers={state.workers}
          lineRate={lineThroughput(state, line)}
          shiftActive={shiftActive}
          selectedWorker={selectedWorker}
          onSelectWorker={selectWorker}
          onAssign={assignWorker}
          onUnassign={unassignStation}
        />
      ))}

      <CrewBench
        benchWorkers={benchWorkers}
        selectedWorkerId={selectedWorkerId}
        cash={state.cash}
        onHire={hireWorker}
        onSelectWorker={selectWorker}
        onTerminate={confirmTerminate}
      />
    </View>
  );
}

// --- Morning standup ---------------------------------------------------------

function MorningBanner({
  state, condition, canRepeat, hasSupervisor, onAutoFill, onRepeat, onStart,
}: {
  state: GameState;
  condition: DayConditionInfo;
  canRepeat: boolean;
  hasSupervisor: boolean;
  onAutoFill: () => void;
  onRepeat: () => void;
  onStart: () => void;
}) {
  const workers = Object.values(state.workers);
  const present = workers.filter((w) => w.presentThisShift);
  const absent = workers.filter((w) => !w.presentThisShift);
  const totalStations = Object.values(state.lines).reduce((n, l) => n + l.stations.length, 0);
  const staffed = Object.values(state.lines).reduce((n, l) => n + l.stations.filter((s) => s.assignedWorkerId).length, 0);
  const assigned = new Set(Object.values(state.lines).flatMap((line) => [
    ...(line.stations.map((s) => s.assignedWorkerId).filter(Boolean) as string[]),
    ...(line.supportWorkerIds ?? []),
  ]));
  const unplacedPresent = present.filter((w) => !assigned.has(w.id));
  const day = dayOfTick(state.tick);
  const accent = TONE_COLOR[condition.tone] ?? colors.cyan;

  return (
    <Panel style={[styles.banner, { borderColor: accent }]}>
      <Eyebrow color={accent}>Day {day + 1} · {weekday(day)} — Morning standup</Eyebrow>
      <Text style={[shared.h2, { marginTop: 2 }]}>Who showed up today?</Text>
      <Text style={[shared.body, { marginTop: 6 }]}>
        <Text style={{ color: colors.green, fontWeight: '900' }}>{present.length}</Text> of {workers.length} clocked in
        {absent.length > 0 ? `  ·  ${absent.length} no-show${absent.length > 1 ? 's' : ''}` : ''}. {condition.label}: {condition.note}.
      </Text>
      {absent.length > 0 && (
        <Text style={[styles.bannerOut, { marginTop: 4 }]}>Out today: {absent.map((w) => w.name.split(' ')[0]).join(', ')}</Text>
      )}
      <Text style={styles.bannerStations}>{staffed}/{totalStations} stations staffed</Text>
      {unplacedPresent.length > 0 && (
        <Text style={styles.bannerWarn}>
          {unplacedPresent.length} present on the bench: assign them or they go home unpaid with a morale hit.
        </Text>
      )}
      <View style={styles.bannerActions}>
        {hasSupervisor && <Button label="Auto-fill" tone="muted" onPress={onAutoFill} style={{ flex: 1 }} />}
        <Button label="Repeat yesterday" tone="muted" disabled={!canRepeat} onPress={onRepeat} style={{ flex: 1 }} />
        <Button label="Start shift ▸" tone="primary" onPress={onStart} style={{ flex: 1 }} />
      </View>
    </Panel>
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

function ShiftImpactPanel({ report }: { report: NonNullable<GameState['lastShiftReport']> }) {
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
      <View style={styles.rowBetween}>
        <View>
          <Eyebrow>Last shift</Eyebrow>
          <Text style={shared.h2}>People Impact</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.bigScore}>{Math.round(report.totalUnits)}</Text>
          <Text style={shared.bodyMute}>units · {formatCurrency(report.payroll)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <StatCell label="Worked" value={`${report.workedCount}`} tone={colors.green} />
        <StatCell label="Sent home" value={`${report.sentHomeCount}`} tone={colors.amber} />
        <StatCell label="No-show" value={`${report.noShowCount}`} tone={colors.red} />
      </View>
      <View style={{ marginTop: 10, gap: 6 }}>
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
      </View>
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
    <Panel style={{ borderColor: colors.gold }}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <CharacterAvatar worker={worker} size="sm" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.workerName} numberOfLines={1}>{profile.firstName} · {worker.name}</Text>
              {worker.isLead && <Pill color={colors.gold}>LEAD</Pill>}
              {worker.permanent && <Pill color={colors.purple}>CO</Pill>}
            </View>
            <Text style={{ color: riskColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
              {riskCopy} · {formatCurrency(effectiveWage(worker, payPolicy))}/shift
            </Text>
          </View>
        </View>
        <Button label="Cancel" tone="ghost" small onPress={onCancel} />
      </View>
      <TraitChips worker={worker} style={{ marginTop: 10 }} />
      <Text style={[styles.leverLabel, { marginTop: 10 }]}>Tap a station to assign · or train below</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
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
              <Text style={styles.trainStation}>{STATION_NAMES[sid]}</Text>
              <Text style={styles.trainProf}>{skill ? pct(skill.proficiency) : 'new'}</Text>
              <Text style={styles.trainCost}>{formatCurrency(cost)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 10 }}>
        <Button label="Terminate" tone="danger" small onPress={() => onTerminate(worker)} />
      </View>
    </Panel>
  );
}

// --- A production line with its stations -------------------------------------

function FloorLine({
  lineId, line, workers, lineRate, shiftActive, selectedWorker, onSelectWorker, onAssign, onUnassign,
}: {
  lineId: string; line: Line; workers: Record<string, Worker>; lineRate: number;
  shiftActive: boolean; selectedWorker: Worker | null;
  onSelectWorker: (id: string | null) => void;
  onAssign: (workerId: string, lineId: string, stationId: string) => void;
  onUnassign: (lineId: string, stationId: string) => void;
}) {
  const presentCount = line.stations.filter((s) => s.assignedWorkerId && workers[s.assignedWorkerId]?.presentThisShift).length;
  const isStopped = presentCount === 0;
  const isShort = presentCount > 0 && presentCount < line.stations.length;
  const running = shiftActive && !isStopped;
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
    <Panel>
      <View style={[styles.rowBetween, { marginBottom: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pill color={colors.sky} filled>{line.name}</Pill>
          {line.automation > 0 && <Pill color={colors.cyan}>⚙ L{line.automation}</Pill>}
          {line.leadId && workers[line.leadId] && <Pill color={colors.gold}>LEAD</Pill>}
        </View>
        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '900' }}>{statusText}</Text>
      </View>

      <ConveyorBelt running={running} rate={lineRate} />

      <View style={styles.stationGrid}>
        {line.stations.map((station) => {
          const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
          const present = worker?.presentThisShift ?? false;
          const isMatch = selectedWorker?.skills.some((sk) => sk.stationId === station.id) ?? false;
          return (
            <StationTile
              key={station.id}
              stationName={station.name}
              stationId={station.id}
              worker={worker}
              present={present}
              working={present && running}
              hasTarget={selectedWorker !== null}
              isMatch={isMatch}
              selectedFirstName={selectedWorker ? profileForWorker(selectedWorker).firstName : null}
              onPress={() => {
                if (selectedWorker) onAssign(selectedWorker.id, lineId, station.id);
                else if (worker) onSelectWorker(worker.id);
              }}
              onClear={() => onUnassign(lineId, station.id)}
            />
          );
        })}
      </View>

      <SupportSlot
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

function StationTile({
  stationName, stationId, worker, present, working, hasTarget, isMatch, selectedFirstName, onPress, onClear,
}: {
  stationName: string; stationId: string; worker: Worker | null;
  present: boolean; working: boolean; hasTarget: boolean; isMatch: boolean;
  selectedFirstName: string | null; onPress: () => void; onClear: () => void;
}) {
  const theme = STATION_THEMES[stationId] ?? STATION_THEMES.s1;
  const borderColor = isMatch ? colors.green : hasTarget ? theme.color : worker && !present ? colors.red : colors.border;
  return (
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
            <Text style={{ color: isMatch ? colors.green : hasTarget ? colors.cyan : colors.textMute, fontSize: 11, fontWeight: '800', textAlign: 'center' }}>
              {hasTarget ? (isMatch ? `${selectedFirstName ?? 'Crew'} fits` : `Place ${selectedFirstName ?? 'crew'}`) : 'Open'}
            </Text>
          </>
        )}
      </View>
      {worker && <MiniBar label="Mood" value={worker.morale} color={present ? colors.green : colors.red} />}
    </Pressable>
  );
}

function SupportSlot({
  worker, present, working, hasTarget, selectedFirstName, onPress, onClear,
}: {
  worker: Worker | null; present: boolean; working: boolean; hasTarget: boolean;
  selectedFirstName: string | null; onPress: () => void; onClear: () => void;
}) {
  const profile = worker ? profileForWorker(worker) : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.support, working && { borderColor: colors.teal }, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.supportLabel}>Support</Text>
        <Text style={styles.supportTitle} numberOfLines={1}>
          {worker && profile ? `${profile.firstName} helping` : hasTarget ? `Add ${selectedFirstName ?? 'helper'}` : 'Overstaff line'}
        </Text>
        <Text style={shared.bodyMute} numberOfLines={1}>
          {worker ? `${present ? 'Paid helper' : 'No-show'} · +${Math.round(SUPPORT_OUTPUT_BONUS * 100)}% lift` : 'Paid helper slot'}
        </Text>
      </View>
      {worker && <CharacterAvatar worker={worker} size="sm" />}
      {worker && <Pressable hitSlop={8} onPress={onClear}><Text style={styles.stationClear}>✕</Text></Pressable>}
    </Pressable>
  );
}

// --- Crew bench --------------------------------------------------------------

function CrewBench({
  benchWorkers, selectedWorkerId, cash, onHire, onSelectWorker, onTerminate,
}: {
  benchWorkers: Worker[]; selectedWorkerId: string | null; cash: number;
  onHire: () => void; onSelectWorker: (id: string | null) => void; onTerminate: (worker: Worker) => void;
}) {
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Crew bench</Eyebrow>
          <Text style={shared.h2}>{benchWorkers.length === 0 ? 'All Deployed' : 'Ready Crew'}</Text>
          <Text style={[shared.bodyMute, { marginTop: 2 }]}>Present crew left here go home unpaid and lose morale.</Text>
        </View>
        <Button label={`Hire ${formatCurrency(HIRE_COST)}`} tone="primary" disabled={cash < HIRE_COST} onPress={onHire} />
      </View>
      <View style={{ gap: 10, marginTop: 12 }}>
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
      </View>
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
  workerName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  trainBtn: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, gap: 2 },
  trainStation: { color: colors.text, fontSize: 12, fontWeight: '900' },
  trainProf: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  trainCost: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  stationGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  station: { flex: 1, backgroundColor: 'rgba(8,13,24,0.5)', borderRadius: radius.md, borderWidth: 1.5, padding: 8, gap: 6, minHeight: 132 },
  stationTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stationCode: { width: 22, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  stationCodeText: { color: colors.bgDeep, fontSize: 9, fontWeight: '900' },
  stationNameTag: { color: colors.textDim, fontSize: 10, fontWeight: '800', flex: 1 },
  stationClear: { color: colors.textMute, fontSize: 13, fontWeight: '900', paddingHorizontal: 2 },
  stationBody: { alignItems: 'center', gap: 3, flex: 1, justifyContent: 'center' },
  stationName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  emptyIcon: { color: colors.textMute, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  support: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, backgroundColor: 'rgba(53,208,186,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
  supportLabel: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  supportTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 1 },
  emptyBench: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 18 },
  crewCard: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1.5, padding: 10 },
  crewName: { color: colors.text, fontSize: 17, fontWeight: '900' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
