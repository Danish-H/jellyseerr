import { Router } from 'express';
import path from 'path';
import user from './user';
import authRoutes from './auth';
import { checkUser, isAuthenticated } from '../middleware/auth';
import settingsRoutes from './settings';
import { Permission } from '../lib/permissions';
import { getSettings } from '../lib/settings';
import searchRoutes from './search';
import discoverRoutes from './discover';
import requestRoutes from './request';
import movieRoutes from './movie';
import tvRoutes from './tv';
import mediaRoutes from './media';
import personRoutes from './person';
import collectionRoutes from './collection';
import { getAppVersion } from '../utils/appVersion';
import { existsSync } from 'fs';
import logger from '../logger';

const COMMIT_TAG_PATH = path.join(__dirname, '../../committag.json');
let commitTag = 'local';

if (existsSync(COMMIT_TAG_PATH)) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  commitTag = require(COMMIT_TAG_PATH).commitTag;
  logger.info(`Commit Tag: ${commitTag}`);
}

const router = Router();

router.use(checkUser);

router.get('/status', (req, res) => {
  return res.status(200).json({
    version: getAppVersion(),
    commitTag,
  });
});

router.use('/user', isAuthenticated(Permission.MANAGE_USERS), user);
router.get('/settings/public', (_req, res) => {
  const settings = getSettings();

  return res.status(200).json(settings.public);
});
router.use(
  '/settings',
  isAuthenticated(Permission.MANAGE_SETTINGS),
  settingsRoutes
);
router.use('/search', isAuthenticated(), searchRoutes);
router.use('/discover', isAuthenticated(), discoverRoutes);
router.use('/request', isAuthenticated(), requestRoutes);
router.use('/movie', isAuthenticated(), movieRoutes);
router.use('/tv', isAuthenticated(), tvRoutes);
router.use('/media', isAuthenticated(), mediaRoutes);
router.use('/person', isAuthenticated(), personRoutes);
router.use('/collection', isAuthenticated(), collectionRoutes);
router.use('/auth', authRoutes);

router.get('/', (_req, res) => {
  return res.status(200).json({
    api: 'Overseerr API',
    version: '1.0',
  });
});

export default router;
