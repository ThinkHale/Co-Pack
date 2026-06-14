import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  GameState,
  nextLineCost, canBuyLine,
  automationCost, canAutomate, automationMultiplier, AUTOMATION_MAX_LEVEL, AUTOMATION_UPKEEP_PER_LEVEL,
  FEATURE_UNLOCKS, canBuyUnlock, hasUnlock,
  canHireSupervisor, SUPERVISOR_COST, SUPERVISOR_SALARY_PER_SHIFT,
  NIGHT_OUTPUT_BONUS, NIGHT_LABOR_RATE, NIGHT_OVERHEAD,
} from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency } from '../format';
import { useGameStore } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button } from '../components/common';

// UPGRADES — capital decisions: capability unlocks, lines & automation.
// Day-to-day operations live on Office; app controls live in Settings there.
export function CorporateScreen({ state }: { state: GameState }) {
  const {
    buyLine, upgradeAutomation, buyUnlock, hireSupervisor,
    toggleAutoShift, toggleNightShift,
  } = useGameStore();
  const lines = Object.entries(state.lines);
  const lineCost = nextLineCost(state);
  const canAfford = canBuyLine(state);

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <Eyebrow>Upgrades</Eyebrow>
        <Text style={shared.h2}>Capabilities</Text>
        <Text style={[shared.bodyMute, { marginTop: 4 }]}>
          One-time purchases that open up new levers. Earned, not given.
        </Text>
        <View style={{ gap: 10, marginTop: 12 }}>
          <View style={styles.officeLine}>
            <View style={styles.rowBetween}>
              <Text style={styles.lineName}>{state.hasSupervisor ? 'Floor Supervisor' : '🔒 Floor Supervisor'}</Text>
              {state.hasSupervisor && <Pill color={colors.green} filled>OWNED</Pill>}
            </View>
            <Text style={[shared.bodyMute, { marginTop: 3 }]}>
              Runs missed standups and unlocks second shift licensing. Salary {formatCurrency(SUPERVISOR_SALARY_PER_SHIFT)}/shift.
            </Text>
            {!state.hasSupervisor ? (
              <Button
                label={`Hire supervisor · ${formatCurrency(SUPERVISOR_COST)}`}
                tone="muted"
                disabled={!canHireSupervisor(state)}
                onPress={hireSupervisor}
                style={{ marginTop: 8 }}
              />
            ) : (
              <Button
                label={state.autoShift ? 'Auto-shift ON' : 'Auto-shift off'}
                tone={state.autoShift ? 'primary' : 'muted'}
                onPress={toggleAutoShift}
                style={{ marginTop: 8 }}
              />
            )}
          </View>
          {FEATURE_UNLOCKS.map((u) => {
            const owned = state.unlocks.includes(u.id);
            return (
              <View key={u.id} style={styles.officeLine}>
                <View style={styles.rowBetween}>
                  <Text style={styles.lineName}>{owned ? u.name : `🔒 ${u.name}`}</Text>
                  {owned && <Pill color={colors.green} filled>OWNED</Pill>}
                </View>
                <Text style={[shared.bodyMute, { marginTop: 3 }]}>{u.blurb}</Text>
                {!owned && (
                  <>
                    {u.requiresSupervisor && !state.hasSupervisor && (
                      <Text style={styles.requires}>Requires a floor supervisor</Text>
                    )}
                    <Button
                      label={`Unlock · ${formatCurrency(u.cost)}`}
                      tone="muted"
                      disabled={!canBuyUnlock(state, u.id)}
                      onPress={() => buyUnlock(u.id)}
                      style={{ marginTop: 8 }}
                    />
                  </>
                )}
                {owned && u.id === 'night_shift' && hasUnlock(state, 'night_shift') && (
                  <Button
                    label={state.nightShift
                      ? `Night shift ON · +${Math.round(NIGHT_OUTPUT_BONUS * 100)}% output`
                      : `Night shift off · +${Math.round(NIGHT_OUTPUT_BONUS * 100)}% output, +${Math.round(NIGHT_LABOR_RATE * 100)}% payroll + ${formatCurrency(NIGHT_OVERHEAD)}/shift`}
                    tone={state.nightShift ? 'accent' : 'muted'}
                    onPress={toggleNightShift}
                    style={{ marginTop: 8 }}
                  />
                )}
              </View>
            );
          })}
        </View>
      </Panel>

      <Panel>
        <Eyebrow>Capacity</Eyebrow>
        <Text style={shared.h2}>Production Lines</Text>
        <Button
          label={`Open Line ${String.fromCharCode(64 + state.lineCount + 1)} · ${formatCurrency(lineCost)}`}
          tone="primary"
          disabled={!canAfford}
          onPress={buyLine}
          style={{ marginTop: 10 }}
        />
        <View style={{ gap: 10, marginTop: 12 }}>
          {lines.map(([lineId, line]) => {
            const cost = automationCost(line);
            const upgradable = canAutomate(line) && state.cash >= cost;
            return (
              <View key={lineId} style={styles.officeLine}>
                <View style={styles.rowBetween}>
                  <Text style={styles.lineName}>{line.name}</Text>
                  <Pill color={colors.cyan}>+{Math.round((automationMultiplier(line) - 1) * 100)}% output</Pill>
                </View>
                <Text style={[shared.bodyMute, { marginTop: 3 }]}>
                  Automation L{line.automation}/{AUTOMATION_MAX_LEVEL}
                  {line.automation > 0 ? ` · upkeep ${formatCurrency(line.automation * AUTOMATION_UPKEEP_PER_LEVEL)}/shift` : ''}
                  {line.leadId && state.workers[line.leadId] ? ` · Lead: ${state.workers[line.leadId].name}` : ' · No lead'}
                </Text>
                <Button
                  label={canAutomate(line) ? `Upgrade automation · ${formatCurrency(cost)}` : 'Fully automated'}
                  tone="muted"
                  disabled={!upgradable}
                  onPress={() => upgradeAutomation(lineId)}
                  style={{ marginTop: 8 }}
                />
              </View>
            );
          })}
        </View>
      </Panel>

    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  officeLine: { backgroundColor: 'rgba(248,245,223,0.08)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: 12 },
  lineName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  requires: { color: colors.gold, fontSize: 10, fontWeight: '900', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
});
