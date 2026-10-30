// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

export type {
  FeedEntry,
  FeedReputationOptions,
  FeedRow,
  FraudFeed,
  FriLevel,
  VpaResolver,
} from './feed';
export {
  InMemoryFeed,
  feedReputationRule,
  friEntry,
  friFeed,
  mobileFromVpa,
  normalizeMobile,
  normalizeVpa,
} from './feed';
export { loadFriSnapshotFile, parseFriSnapshot } from './snapshotFile';
export type {
  FriSnapshotFile,
  LoadSnapshotOptions,
  SnapshotLoadResult,
} from './snapshotFile';
