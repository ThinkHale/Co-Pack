import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  GameState, Order, orderProfile,
  reputationPayMultiplier, totalThroughput,
  openObjectives, OBJECTIVES, Objective,
  CLIENT_TIERS,
  TICKS_PER_SHIFT,
  hasUnlock,
  canSignClient, tierUnlocked,
} from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency, pct, ticksToTimeRemaining } from '../format';
import { Panel, Eyebrow, Pill, Bar, Button } from '../components/common';
import { useGameStore } from '../store/useGameStore';

export function OrdersScreen({ state }: { state: GameState }) {
  const sorted = [...state.activeOrders].sort((a, b) => (a.deadline - state.tick) - (b.deadline - state.tick));
  const firstOrder = sorted[0];
  const throughput = totalThroughput(state);
  const primaryClient = firstOrder ? state.clients[firstOrder.clientId] : Object.values(state.clients)[0];
  const reputation = primaryClient?.reputation ?? 1;

  return (
    <View style={{ gap: 14 }}>
      {firstOrder ? (
        <OrderHero order={firstOrder} tick={state.tick} throughput={throughput} reputation={reputation} clientName={primaryClient?.name ?? 'Client'} />
      ) : (
        <Panel><Text style={styles.noOrders}>No active orders</Text></Panel>
      )}
      <OrderControls state={state} />
      {sorted.length > 1 && <OrdersStrip orders={sorted.slice(1)} tick={state.tick} clients={state.clients} />}
      <ClientBook state={state} />
      <ObjectivesPanel state={state} />
    </View>
  );
}

function OrderControls({ state }: { state: GameState }) {
  const toggleOvertime = useGameStore((s) => s.toggleOvertime);
  const overtimeUnlocked = hasUnlock(state, 'overtime');
  return (
    <Panel style={styles.orderControls}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Tempo decision</Eyebrow>
          <Text style={styles.controlTitle}>{state.overtime ? 'Overtime is pushing output' : 'Overtime available for tight orders'}</Text>
          <Text style={[shared.bodyMute, { marginTop: 2 }]}>
            Faster shipping now, morale cost at shift close.
          </Text>
        </View>
        <Button
          label={state.overtime ? 'OT on' : overtimeUnlocked ? 'Run OT' : 'OT locked'}
          tone={state.overtime ? 'accent' : 'muted'}
          disabled={!overtimeUnlocked}
          onPress={toggleOvertime}
        />
      </View>
    </Panel>
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
    <Panel style={styles.orderHero}>
      <View style={styles.heroTop}>
        <View style={styles.skuCard}>
          <Eyebrow color={colors.gold}>Active SKU</Eyebrow>
          <Text style={styles.heroSku} numberOfLines={1}>{order.sku}</Text>
          <Text style={styles.heroMeta} numberOfLines={1}>{orderProfile(order).name}</Text>
        </View>
        <View style={styles.heroChips}>
          <Pill color={deadlineColor} filled>{ticksToTimeRemaining(remaining)}</Pill>
          <Pill color={repLow ? colors.red : colors.cyan}>{clientName} · Rep {pct(reputation)}</Pill>
        </View>
      </View>
      <View style={styles.contractFacts}>
        <View style={styles.contractFact}>
          <Text style={styles.scoreLabel}>Units left</Text>
          <Text style={styles.scoreValue}>{Math.ceil(unitsLeft)}</Text>
        </View>
        <View style={styles.contractFact}>
          <Text style={styles.scoreLabel}>Rate</Text>
          <Text style={[styles.factValue, { color: colors.cyan }]}>{throughput.toFixed(2)}/m</Text>
        </View>
        <View style={styles.contractFact}>
          <Text style={styles.scoreLabel}>Pay</Text>
          <Text style={[styles.factValue, { color: colors.green }]}>${effectivePay.toFixed(2)}/u</Text>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Bar value={Math.max(progress, 0.01)} color={isOverdue ? colors.red : colors.gold} height={12} />
        <View style={styles.progLabel}>
          <Text style={styles.progText}>{(progress * 100).toFixed(1)}%</Text>
          <Text style={styles.progText}>{Math.round(order.unitsCompleted)} / {order.units}</Text>
        </View>
      </View>
      <Text style={[shared.bodyMute, { marginTop: 8 }]}>
        Current reputation pays {Math.round(payMultiplier * 100)}% of base. Missed deadlines still hit the client relationship.
      </Text>
    </Panel>
  );
}

function OrdersStrip({ orders, tick, clients }: { orders: Order[]; tick: number; clients: GameState['clients'] }) {
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
              <Text style={[shared.bodyMute, { marginTop: 4 }]} numberOfLines={1}>
                {clients[o.clientId]?.name ?? o.clientId} · {Math.round(o.unitsCompleted)} / {o.units} · ${o.revenuePerUnit.toFixed(2)}/u
              </Text>
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

// The growth ladder made visible: every client tier, what it pays, and exactly
// what it takes to land the next one — the answer to "why grow?". Web parity.
function ClientBook({ state }: { state: GameState }) {
  const signClient = useGameStore((s) => s.signClient);
  const activeLines = Object.values(state.lines).filter((l) => l.active).length;
  return (
    <Panel>
      <Eyebrow>Client book</Eyebrow>
      <Text style={shared.h2}>Contract Ladder</Text>
      <Text style={[shared.bodyMute, { marginTop: 4 }]}>
        Qualify by shipping, then spend cash to add the next client to your book.
      </Text>
      <View style={{ gap: 8, marginTop: 10 }}>
        {CLIENT_TIERS.map((tier) => {
          const client = state.clients[tier.id];
          const signed = !!client;
          const qualified = tierUnlocked(state, tier);
          const canSign = canSignClient(state, tier.id);
          const needsShipped = Math.max(0, tier.unlockAtCompleted - state.completedOrders);
          const needsLines = Math.max(0, tier.minLines - activeLines);
          const unlockNote = [
            needsShipped > 0 ? `ship ${needsShipped} more contract${needsShipped === 1 ? '' : 's'}` : null,
            needsLines > 0 ? `open ${needsLines} more line${needsLines === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ') || `${formatCurrency(tier.signingCost)} signing cost`;
          const status = signed ? 'Signed' : qualified ? 'Ready to buy' : 'Locked';
          return (
            <View key={tier.id} style={[styles.clientRow, !signed && !qualified && { opacity: 0.58 }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.clientName} numberOfLines={1}>{tier.name}</Text>
                  <Text style={styles.clientRate}>
                    ${tier.revenueBase.toFixed(2)}-{(tier.revenueBase + tier.revenueSpread).toFixed(2)}/u
                  </Text>
                </View>
                <Pill color={signed ? colors.green : qualified ? colors.gold : colors.textMute} filled={signed}>{status}</Pill>
              </View>
              <Text style={[shared.bodyMute, { marginTop: 2 }]} numberOfLines={2}>
                {signed
                  ? `Rep ${pct(client.reputation)} - paying ${pct(reputationPayMultiplier(client.reputation))} of rate. ${tier.blurb}`
                  : qualified ? `${tier.blurb} ${formatCurrency(tier.signingCost)} to add them to the book.` : unlockNote}
              </Text>
              {!signed && qualified && (
                <Button
                  label={`Purchase access · ${formatCurrency(tier.signingCost)}`}
                  tone="muted"
                  disabled={!canSign}
                  onPress={() => signClient(tier.id)}
                  style={{ marginTop: 8 }}
                />
              )}
            </View>
          );
        })}
      </View>
    </Panel>
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

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  noOrders: { color: colors.textMute, fontSize: 13, fontWeight: '900', textAlign: 'center', paddingVertical: 24, textTransform: 'uppercase', letterSpacing: 1 },
  orderControls: { borderColor: colors.borderStrong },
  controlTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  orderHero: { borderColor: colors.gold, borderWidth: 1.5, backgroundColor: colors.panel },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  skuCard: { flex: 1, minWidth: 0, backgroundColor: colors.paper, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 10, paddingVertical: 8 },
  heroSku: { color: colors.text, fontSize: 28, fontWeight: '900', lineHeight: 31 },
  heroMeta: { color: colors.textMute, fontSize: 11, fontWeight: '900', marginTop: 1 },
  heroChips: { gap: 5, alignItems: 'flex-end', maxWidth: 170 },
  contractFacts: { flexDirection: 'row', gap: 8, marginTop: 10 },
  contractFact: { flex: 1, minHeight: 58, backgroundColor: 'rgba(34,84,99,0.07)', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 9, paddingVertical: 8, justifyContent: 'space-between' },
  scoreLabel: { color: colors.textMute, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  scoreValue: { color: colors.text, fontSize: 28, fontWeight: '900', lineHeight: 30 },
  factValue: { fontSize: 16, fontWeight: '900', lineHeight: 18 },
  progLabel: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  orderMini: { backgroundColor: 'rgba(34,84,99,0.07)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: 10 },
  orderMiniSku: { color: colors.text, fontSize: 14, fontWeight: '900' },
  clientRow: { backgroundColor: 'rgba(34,84,99,0.07)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, borderLeftWidth: 3, borderLeftColor: colors.gold, padding: 10 },
  clientName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  clientRate: { color: colors.green, fontSize: 12, fontWeight: '900' },
  objRow: { backgroundColor: 'rgba(34,84,99,0.07)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: 12 },
  objLabel: { color: colors.text, fontSize: 14, fontWeight: '900', flex: 1 },
  objReward: { color: colors.green, fontSize: 13, fontWeight: '900' },
  objProg: { color: colors.textMute, fontSize: 10, fontWeight: '800', marginTop: 4 },
  empty: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
});
