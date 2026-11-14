import { paintMarket } from '../art/scenes/market';
import type { Chapter } from '../game/chapter';
import { buildLanes } from './ch1.level';

/**
 * Chapter One — The Lanes.
 * Sol comes down into the night market, meets Baek, learns to hide from a
 * Listener and wakes the first relay.
 */
export const lanes: Chapter = {
  id: 'lanes',
  kicker: 'CHAPTER ONE',
  title: 'THE LANES',
  subtitle: 'Low town. Eleven years quiet.',
  music: 'lanes',
  amb: { city: 0.7, crowd: 0.8 },
  build: buildLanes,
  paint: paintMarket,

  setup(d) {
    const w = d.world;
    const relayDone = d.flag('lanes.relay') > 0;
    const baekDone = d.flag('lanes.baek') > 0;
    w.signals.relay1 = relayDone ? 1 : 0;
    w.thing('relay1').enabled = baekDone && !relayDone;
    w.drone('d1').active = false;
    w.drone('d2').active = relayDone;
    d.objective(
      relayDone ? 'Find a way up to the rooftops' : baekDone ? 'Climb to the relay above the laundry' : 'Find Baek at the orange stall',
    );
  },

  async intro(d) {
    d.lock();
    await d.bars(true, 0);
    await d.wait(0.6);
    void d.fade(0, 2.2);
    await d.card('CHAPTER ONE', 'THE LANES', 'Low town. Eleven years quiet.');
    await d.walk('sol', 118, 34);
    d.sfx('static');
    await d.say('mun', 'There you are. I can hear the street through your set.');
    await d.say('mun', 'Eleven years ago every stall on this lane had me on. Now they would be fined for humming along.');
    await d.say('sol', 'The alert went to subscribers two hours ago. Nobody down here looks worried.');
    await d.say('mun', 'Nobody down here was told. Find the orange stall. Baek has been keeping something for me.');
    await d.bars(false);
    d.unlock();
    d.objective('Find Baek at the orange stall');
    d.mark('cp_start');
  },

  triggers: {
    vista(d) {
      d.bark('mun', 'Look up, between the roofs. That needle with the red light is the Spire. That is where tonight ends.', 6);
    },
    market(d) {
      d.bark('sol', 'Smells like the stalls outside my mother\'s building.', 4);
    },
    async baek_near(d) {
      if (d.flag('lanes.baek')) return;
      d.bark('mun', 'Orange tarp. That is him.', 3);
    },
    gauntlet(d) {
      if (!d.flag('lanes.relay')) return;
      d.bark('mun', 'They heard that carrier come up. Another Listener on your street. Keep out of its light.', 6);
    },
  },

  interacts: {
    async mime(d) {
      d.lock();
      d.faceEachOther('mime');
      if (d.flag('lanes.mime')) {
        d.pose('mime', 'talk');
        await d.say('sol', '(He tips an invisible hat.)');
        d.pose('mime', null);
        d.unlock();
        return;
      }
      d.pose('mime', 'talk');
      await d.say('sol', 'A busker with no instrument.');
      await d.say('mun', 'He had a harmonica once. Performance licence is four hundred a month. So now he plays the air.');
      const pick = await d.choose(['Applaud, without a sound', 'Walk on']);
      if (pick === 0) {
        d.pose('sol', 'talk');
        await d.wait(1.2);
        d.pose('sol', null);
        await d.say('mime', '(He bows so low his hair brushes the wet road.)');
        d.set('lanes.mime', 1);
      } else {
        d.set('lanes.mime', 2);
      }
      d.pose('mime', null);
      d.unlock();
    },

    async driver(d) {
      d.lock();
      d.faceEachOther('driver');
      if (d.flag('lanes.driver')) {
        await d.say('driver', d.flag('lanes.driver') === 1 ? 'Top of Carver Hill. I heard you.' : 'Still here. Still dry.');
        d.unlock();
        return;
      }
      await d.say('driver', 'My wife\'s phone buzzed about some surge. Mine did nothing. I pay for a cab licence, not for weather.');
      await d.say('sol', 'Where do you park overnight?');
      await d.say('driver', 'Pier Street. Same as always.');
      const pick = await d.choose(['Move it uphill tonight. Trust me.', 'Probably nothing.']);
      if (pick === 0) {
        await d.say('driver', '...You are one of the mast people. All right. Carver Hill, then.');
        d.set('lanes.driver', 1);
      } else {
        await d.say('driver', 'That is what the app said too.');
        d.set('lanes.driver', 2);
      }
      d.unlock();
    },

    async baek(d) {
      const w = d.world;
      d.lock();
      d.faceEachOther('baek');
      if (d.flag('lanes.relay')) {
        await d.say('baek', 'My old set is hissing like a kettle. Go on, before I start crying into the broth.');
        d.unlock();
        return;
      }
      if (d.flag('lanes.baek')) {
        await d.say('baek', 'Ladder by the laundry. Up, across, up again.');
        d.unlock();
        return;
      }
      await d.bars(true);
      d.pose('baek', 'talk');
      await d.say('baek', 'Sit or move on, I have no licence for loitering.');
      await d.say('sol', 'Mun sent me.');
      await d.say('baek', '...Eleven years. She still talks like the weather report?');
      await d.say('mun', 'I can hear you, you old fraud.');
      await d.say('baek', 'Ha! The box is on the repair shop roof. I oil it every spring and tell the inspectors it is a pigeon trap.');
      d.pose('baek', 'cook');
      // A Listener comes down the lane: the hiding lesson.
      const dr = w.drone('d1');
      dr.active = true;
      d.sfx('spot', 0.6);
      d.focus(1330, 150, 1.0, 1.6);
      await d.wait(0.9);
      await d.say('baek', 'Listener. Do not run. Behind my crates, and get low.');
      d.release();
      await d.bars(false);
      d.unlock();
      d.objective('Hide behind the crates: hold DOWN');
      d.set('lanes.baek', 1);
      d.mark('cp_baek');
      // Wait for the drone to finish its pass (being seen restarts from the checkpoint).
      while (dr.x > 1110) await d.wait(0.25);
      dr.active = false;
      d.bark('baek', 'Gone. It comes back every few minutes. Ladder by the laundry. Go.', 5);
      w.thing('relay1').enabled = true;
      d.objective('Climb to the relay above the laundry');
    },

    async relay1(d) {
      const w = d.world;
      d.lock();
      await d.bars(true);
      await d.walk('sol', 1794, 30);
      d.face('sol', 1);
      d.pose('sol', 'kneel');
      d.sfx('switch');
      await d.wait(0.5);
      await d.say('sol', 'Valves are warm. Somebody has been feeding this thing.');
      await d.say('mun', 'It has a carrier in it somewhere. Find it and hold it steady.');
      await d.tune({ id: 'relay1', freq: 0.63, hold: 1.4, label: 'RELAY 1 · LANES' });
      w.signals.relay1 = 1;
      w.thing('relay1').enabled = false;
      d.sfx('relay');
      d.flash(0.25, 0.8);
      d.shake(0.25);
      d.pose('sol', null);
      await d.wait(0.9);
      await d.say('mun', 'One. Oh, listen to her. I had forgotten what our own noise sounds like.');
      d.focus(1228, 170, 1.25, 1.4);
      await d.wait(1.6);
      d.bark('baek', '...Is that music?', 3);
      await d.wait(2.4);
      d.release();
      await d.say('sol', 'Three more and it reaches the Spire.');
      await d.say('mun', 'The next one is on the rooftops. You will want a guide. The roofs up there belong to the children.');
      await d.bars(false);
      d.unlock();
      d.set('lanes.relay', 1);
      w.drone('d2').active = true;
      d.objective('Find a way up to the rooftops');
      d.mark('cp_relay');
    },

    async jin(d) {
      d.lock();
      d.faceEachOther('jin');
      if (!d.flag('lanes.relay')) {
        await d.say('jin', 'This is my step. Find your own step.');
        d.unlock();
        return;
      }
      await d.bars(true);
      d.pose('jin', 'talk');
      await d.say('jin', 'You are the one who made the radios hiss.');
      await d.say('sol', 'You heard that?');
      await d.say('jin', 'I hear everything. I have a tape of this whole street from when my gran was little. It was loud.');
      await d.say('sol', 'I need to get across the rooftops. To the old water tower.');
      await d.say('jin', 'Grown-ups fall off the Tops. You have to know which roofs are lying.');
      const pick = await d.choose(['Then show me which ones.', 'I climb masts for a living.']);
      if (pick === 0) await d.say('jin', 'Okay. But you do what I do. And you do not tell my gran.');
      else await d.say('jin', 'Masts do not move when you are not looking. Come on. Do what I do.');
      d.set('lanes.jin', 1);
      d.pose('jin', null);
      await d.walk('jin', 2790, 60);
      await d.fade(1, 1.1);
      d.leave('tops');
    },
  },
};
