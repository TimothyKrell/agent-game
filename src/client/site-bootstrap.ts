import { Schema } from 'effect';
import { BootstrapSchema, GameBootstrapSchema } from '../shared/api';
import type { Bootstrap, GameBootstrap } from '../shared/api';

export type SiteBootstrap = Bootstrap | GameBootstrap;

export const SiteBootstrapSchema = Schema.Union([GameBootstrapSchema, BootstrapSchema]);
