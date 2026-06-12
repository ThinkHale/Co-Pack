import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import {
  GameState,
  nextLineCost, canBuyLine,
  automationCost, canAutomate, automationMultiplier, AUTOMATION_MAX_LEVEL, AUTOMATION_UPKEEP_PER_LEVEL,
  FEATURE_UNLOCKS, canBuyUnlock,
} from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency } from '../format';
import { useGameStore } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button } from '../components/common';

// CORPORATE — capital decisions: capability unlocks, lines & automation,
// and the app settings/danger zone. Day-to-day operations live on Office.
export function CorporateScreen({ state }: { state: GameState }) {
  const { buyLine, upgradeAutomation, buyUnlock, adsOn, adFree, toggleAdsTesting, reset } = useGameStore();
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

      <Panel>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Settings · testing</Eyebrow>
            <Text style={[shared.bodyMute, { marginTop: 3 }]}>
              Interstitial ads every 5 shifts{adFree ? ' — removed (purchase simulated) ✓' : ''}.
            </Text>
          </View>
          <Button label={`Ads: ${adsOn ? 'ON' : 'OFF'}`} tone="muted" onPress={toggleAdsTesting} />
        </View>
        <View style={[styles.rowBetween, { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}>
          <View style={{ flex: 1 }}>
            <Eyebrow color={colors.red}>Danger zone</Eyebrow>
            <Text style={[shared.bodyMute, { marginTop: 3 }]}>Wipe the save and start a fresh plant.</Text>
          </View>
          <Button
            label="Reset run"
            tone="danger"
            onPress={() =>
              Alert.alert('Reset the run?', 'This wipes your save and starts a fresh shift.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: reset },
              ])
            }
          />
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  officeLine: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  lineName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  requires: { color: colors.gold, fontSize: 10, fontWeight: '900', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
});
