import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  GameState, Order, Line, Worker,
  reputationPayMultiplier, totalThroughput, lineThroughput,
  openObjectives, OBJECTIVES, Objective,
  TICKS_PER_SHIFT,
} from '@copack/engine';
import { colors, radius, shared, STATION_THEMES } from '../theme';
import { formatCurrency, pct, ticksToTimeRemaining, profileForWorker } from '../format';
import { formatEvent, eventToneColor } from '../events';
import { Panel, Eyebrow, Pill, Bar } from '../components/common';
import { CharacterAvatar } from '../components/Avatar';
import { ConveyorBelt } from '../components/Belt';
import type { GameEvent } from '@copack/engine';

export function OrdersScreen({ state, paused }: { state: GameState; paused: boolean }) {
  const sorted = [...state.activeOrders].sort((a, b) => (a.deadline - state.tick) - (b.deadline - state.tick));
  const firstOrder = sorted[0];
  const throughput = totalThroughput(state);
  const primaryClient = firstOrder ? state.clients[firstOrder.clientId] : Object.values(state.clients)[0];
  const reputation = primaryClient?.reputation ?? 1;
  const recentEvents = [...state.eventLog].reverse().slice(0, 8);

  return (
    <View style={{ gap: 14 }}>
      {firstOrder ? (
        <OrderHero order={firstOrder} tick={state.tick} throughput={throughput} reputation={reputation} clientName={primaryClient?.name ?? 'Client'} />
      ) : (
        <Panel><Text style={styles.noOrders}>No active orders</Text></Panel>
      )}
      {sorted.length > 1 && <OrdersStrip orders={sorted.slice(1)} tick={state.tick} />}
      <FacilityScene state={state} paused={paused} />
      <ObjectivesPanel state={state} />
      <EventLog events={recentEvents} />
    </View>
  );
}

function OrderHero({
  order, tick, throughput, reputation, clientName,
}: { order: Order; tick: number; throughput: number; reputation: number; clientName: string }) {
  const progress = order.unitsCompleted / order.units;
  const remaining = order.deadline - tick;
  const isUrgent = remaining < TICKS_PER_SHIFT;
  const isOverdue = remaining <= 0;
  const unitsLeft = Math.max(order.units - order.unitsCompleted, 0);
  const payMultiplier = reputationPayMultiplier(reputation);
  const effectivePay = order.revenuePerUnit * payMultiplier;
  const repLow = reputation < 0.5;
  const deadlineColor = isOverdue ? colors.red : isUrgent ? colors.amber : colors.green;

  return (
    <Panel style={{ borderColor: colors.gold, borderWidth: 1.5 }}>
      <Eyebrow color={colors.gold}>Active contract</Eyebrow>
      <View style={styles.heroTop}>
        <Text style={styles.heroSku}>{order.sku}</Text>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <Pill color={deadlineColor} filled>{ticksToTimeRemaining(remaining)}</Pill>
          <Pill color={repLow ? colors.red : colors.cyan}>{clientName} · Rep {pct(reputation)}</Pill>
        </View>
      </View>
      <Text style={[shared.body, { marginTop: 8 }]}>
        Pays <Text style={{ color: colors.green, fontWeight: '900' }}>${effectivePay.toFixed(2)}</Text>/unit at current reputation
        {' '}(base ${order.revenuePerUnit.toFixed(2)} × {Math.round(payMultiplier * 100)}%). Miss the deadline and reputation drops.
      </Text>
      <View style={styles.scoreRow}>
        <View>
          <Text style={styles.scoreLabel}>Units left</Text>
          <Text style={styles.scoreValue}>{Math.ceil(unitsLeft)}</Text>
        </View>
        <Text style={styles.rate}>{throughput.toFixed(2)} units/min</Text>
      </View>
      <View style={{ marginTop: 10 }}>
        <Bar value={Math.max(progress, 0.01)} color={isOverdue ? colors.red : colors.gold} height={12} />
        <View style={styles.progLabel}>
          <Text style={styles.progText}>{(progress * 100).toFixed(1)}%</Text>
          <Text style={styles.progText}>{Math.round(order.unitsCompleted)} / {order.units}</Text>
        </View>
      </View>
    </Panel>
  );
}

function OrdersStrip({ orders, tick }: { orders: Order[]; tick: number }) {
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <Eyebrow>Contract board</Eyebrow>
        <Text style={shared.bodyMute}>{orders.length} more queued</Text>
      </View>
      <View style={{ gap: 8, marginTop: 8 }}>
        {orders.map((o) => {
          const remaining = o.deadline - tick;
          const progress = o.unitsCompleted / o.units;
          const urgent = remaining < TICKS_PER_SHIFT;
          const color = remaining <= 0 ? colors.red : urgent ? colors.amber : colors.cyan;
          return (
            <View key={o.id} style={styles.orderMini}>
              <View style={styles.rowBetween}>
                <Text style={styles.orderMiniSku}>{o.sku}</Text>
                <Text style={{ color, fontSize: 11, fontWeight: '900' }}>{ticksToTimeRemaining(remaining)}</Text>
              </View>
              <View style={{ marginTop: 6 }}><Bar value={Math.max(progress, 0.02)} color={color} height={6} /></View>
              <Text style={[shared.bodyMute, { marginTop: 4 }]}>{Math.round(o.unitsCompleted)} / {o.units}</Text>
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

function FacilityScene({ state, paused }: { state: GameState; paused: boolean }) {
  const lines = Object.entries(state.lines);
  const staffedStations = lines.reduce((sum, [, l]) => sum + l.stations.filter((s) => s.assignedWorkerId).length, 0);
  const presentStations = lines.reduce((sum, [, l]) => sum + l.stations.filter((s) => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift).length, 0);

  return (
    <Panel>
      <View style={styles.rowBetween}>
        <View>
          <Eyebrow>Facility live view</Eyebrow>
          <Text style={shared.h2}>Packaging Floor</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={shared.bodyMute}>{lines.length} line{lines.length === 1 ? '' : 's'}</Text>
          <Text style={shared.bodyMute}>{presentStations}/{staffedStations || 0} active</Text>
        </View>
      </View>
      <View style={{ gap: 10, marginTop: 10 }}>
        {lines.map(([lineId, line]) => (
          <FacilityLine key={lineId} line={line} workers={state.workers} lineRate={lineThroughput(state, line)} paused={paused} />
        ))}
      </View>
    </Panel>
  );
}

function FacilityLine({ line, workers, lineRate, paused }: { line: Line; workers: Record<string, Worker>; lineRate: number; paused: boolean }) {
  const presentCount = line.stations.filter((s) => s.assignedWorkerId && workers[s.assignedWorkerId]?.presentThisShift).length;
  const running = presentCount > 0 && !paused;
  return (
    <View style={styles.facLine}>
      <View style={styles.facLabel}>
        <Text style={styles.facName} numberOfLines={1}>{line.name}</Text>
        <Text style={shared.bodyMute}>{presentCount}/{line.stations.length}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <ConveyorBelt running={running} rate={lineRate} parcels={5} height={22} />
      </View>
      <View style={styles.facCrew}>
        {line.stations.map((station) => {
          const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
          const theme = STATION_THEMES[station.id] ?? STATION_THEMES.s1;
          return worker ? (
            <CharacterAvatar key={station.id} worker={worker} size="xs" />
          ) : (
            <View key={station.id} style={[styles.facEmpty, { borderColor: theme.color }]} />
          );
        })}
      </View>
    </View>
  );
}

function ObjectivesPanel({ state }: { state: GameState }) {
  const open = openObjectives(state, 3);
  const cleared = state.completedObjectives.length;
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <View>
          <Eyebrow>Career goals</Eyebrow>
          <Text style={shared.h2}>Objectives</Text>
        </View>
        <Pill color={colors.gold} filled>{cleared}/{OBJECTIVES.length}</Pill>
      </View>
      <View style={{ gap: 8, marginTop: 10 }}>
        {open.length === 0 ? (
          <Text style={styles.empty}>Every goal cleared. You run a hell of a floor.</Text>
        ) : open.map((o) => <ObjectiveRow key={o.id} obj={o} state={state} />)}
      </View>
    </Panel>
  );
}

function ObjectiveRow({ obj, state }: { obj: Objective; state: GameState }) {
  const prog = obj.progress?.(state);
  const ratio = prog ? Math.min(1, prog.current / prog.target) : 0;
  const progText = prog
    ? prog.target >= 1000 ? `${formatCurrency(prog.current)} / ${formatCurrency(prog.target)}` : `${prog.current}/${prog.target}`
    : '';
  return (
    <View style={styles.objRow}>
      <View style={styles.rowBetween}>
        <Text style={styles.objLabel} numberOfLines={1}>{obj.label}</Text>
        <Text style={styles.objReward}>+{formatCurrency(obj.reward)}</Text>
      </View>
      <Text style={[shared.bodyMute, { marginTop: 2 }]}>{obj.hint}</Text>
      {prog && (
        <View style={{ marginTop: 6 }}>
          <Bar value={Math.max(ratio, 0.04)} color={colors.gold} height={8} />
          <Text style={styles.objProg}>{progText}</Text>
        </View>
      )}
    </View>
  );
}

function EventLog({ events }: { events: GameEvent[] }) {
  return (
    <Panel>
      <Eyebrow>Floor radio</Eyebrow>
      <Text style={shared.h2}>Shift Feed</Text>
      <View style={{ gap: 6, marginTop: 10 }}>
        {events.length === 0 ? (
          <Text style={styles.empty}>No radio chatter yet. Start the belt.</Text>
        ) : events.map((event, i) => {
          const { text, tone, tag } = formatEvent(event);
          const color = eventToneColor[tone] ?? colors.textMute;
          return (
            <View key={`${event.tick}-${i}`} style={styles.eventRow}>
              <View style={[styles.eventTag, { backgroundColor: color }]}><Text style={styles.eventTagText}>{tag}</Text></View>
              <Text style={styles.eventText} numberOfLines={2}>{text}</Text>
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  noOrders: { color: colors.textMute, fontSize: 13, fontWeight: '900', textAlign: 'center', paddingVertical: 24, textTransform: 'uppercase', letterSpacing: 1 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 6 },
  heroSku: { color: colors.text, fontSize: 38, fontWeight: '900', flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 },
  scoreLabel: { color: colors.textMute, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  scoreValue: { color: colors.text, fontSize: 36, fontWeight: '900', lineHeight: 38 },
  rate: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  progLabel: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  orderMini: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
  orderMiniSku: { color: colors.text, fontSize: 14, fontWeight: '900' },
  facLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  facLabel: { width: 70 },
  facName: { color: colors.text, fontSize: 12, fontWeight: '900' },
  facCrew: { flexDirection: 'row', gap: 2, width: 76, justifyContent: 'flex-end' },
  facEmpty: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed' },
  objRow: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  objLabel: { color: colors.text, fontSize: 14, fontWeight: '900', flex: 1 },
  objReward: { color: colors.green, fontSize: 13, fontWeight: '900' },
  objProg: { color: colors.textMute, fontSize: 10, fontWeight: '800', marginTop: 4 },
  empty: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 7 },
  eventTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, minWidth: 42, alignItems: 'center' },
  eventTagText: { color: colors.bgDeep, fontSize: 9, fontWeight: '900' },
  eventText: { color: colors.textDim, fontSize: 12, fontWeight: '600', flex: 1 },
});
