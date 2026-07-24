// Module 3 — media. Presigned direct-to-storage uploads (bytes never touch the
// API) + document registration. Backed by the real S3/MinIO adapter.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, DocumentType } from "@navastar/db";
import { Permission } from "@navastar/shared";
import { getStorageProvider } from "@navastar/providers";

const presignBody = z.object({
  shipmentId: z.string().optional(),
  kind: z.nativeEnum(DocumentType),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
});

const docBody = z.object({
  type: z.nativeEnum(DocumentType),
  storageKey: z.string().min(1),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  meta: z.record(z.unknown()).optional(),
});

export default async function uploadRoutes(app: FastifyInstance) {
  // Get a presigned PUT URL. The client uploads bytes directly to storage.
  app.post(
    "/api/uploads/presign",
    { preHandler: [app.requirePermission(Permission.MEDIA_UPLOAD)] },
    async (req, reply) => {
      const parsed = presignBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const { shipmentId, kind, filename, mimeType } = parsed.data;
      const prefix = shipmentId ? `shipments/${shipmentId}/${kind.toLowerCase()}` : `misc/${kind.toLowerCase()}`;
      const presigned = await getStorageProvider().presignUpload(prefix, filename, mimeType);
      return reply.code(201).send(presigned);
    }
  );

  // Register an uploaded object as a Document row (returns a readable URL).
  app.post(
    "/api/shipments/:id/documents",
    { preHandler: [app.requirePermission(Permission.MEDIA_UPLOAD)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = docBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      const doc = await prisma.document.create({
        data: {
          shipmentId: shipment.id,
          type: parsed.data.type,
          storageKey: parsed.data.storageKey,
          mimeType: parsed.data.mimeType ?? null,
          sizeBytes: parsed.data.sizeBytes ?? null,
          meta: parsed.data.meta ? (parsed.data.meta as object) : undefined,
        },
      });
      const url = await getStorageProvider().getUrl(doc.storageKey);
      return reply.code(201).send({ id: doc.id, type: doc.type, storageKey: doc.storageKey, url });
    }
  );
}
