import { collectionResetSchema } from '@gatecheck/shared';
import { collectionManagement, resetCollections } from '../collections.js';
import { helpers, type RouteContext } from './context.js';
export function collectionRoutes({ app, db, admin }: RouteContext) {
  const { params } = helpers(db);
  app.get(
    '/api/events/:eventId/participants/:id/collections',
    { preHandler: admin },
    async (req) => {
      const p = params(req);
      return collectionManagement(db, p.eventId, p.id);
    },
  );
  app.post(
    '/api/events/:eventId/participants/:id/gates/:gateId/reset',
    { preHandler: admin },
    async (req) => {
      const p = params(req);
      return resetCollections(
        db,
        p.eventId,
        p.id,
        p.gateId,
        req.adminId!,
        collectionResetSchema.parse(req.body),
      );
    },
  );
}
