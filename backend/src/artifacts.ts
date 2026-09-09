import { APIError, canonicalJSON, revisionOf, type PageBundle, type PageManifest } from "./protocol.ts";
import { validateBundle } from "./validation.ts";

export interface ManifestRecord { manifest: PageManifest; etag: string }
export interface ArtifactStore {
  getManifest(pageKey: string): Promise<ManifestRecord | null>;
  getBundle(revision: string): Promise<PageBundle | null>;
  putBundle(revision: string, bundle: PageBundle): Promise<void>;
  putManifest(pageKey: string, manifest: PageManifest, expectedETag: string | null): Promise<boolean>;
}

/** Local-only adapter. Never touches Wrangler bindings or the network. */
export class MemoryArtifactStore implements ArtifactStore {
  private manifests = new Map<string, ManifestRecord>();
  private bundles = new Map<string, PageBundle>();
  private serial = 0;
  async getManifest(key: string): Promise<ManifestRecord | null> { return structuredClone(this.manifests.get(key) ?? null); }
  async getBundle(key: string): Promise<PageBundle | null> { return structuredClone(this.bundles.get(key) ?? null); }
  async putBundle(key: string, bundle: PageBundle): Promise<void> {
    const existing = this.bundles.get(key);
    if (existing && canonicalJSON(existing) !== canonicalJSON(bundle)) throw new APIError("IMMUTABLE_CONFLICT", "An immutable artifact already exists with different data.", 409);
    this.bundles.set(key, structuredClone(bundle));
  }
  async putManifest(key: string, manifest: PageManifest, expectedETag: string | null): Promise<boolean> {
    if ((this.manifests.get(key)?.etag ?? null) !== expectedETag) return false;
    this.manifests.set(key, { manifest: structuredClone(manifest), etag: `local-${++this.serial}` });
    return true;
  }
}

/** Each operation checks the explicit runtime gate before using a cloud binding. */
export class R2ArtifactStore implements ArtifactStore {
  private bucket: R2Bucket;
  private assertApproved: () => void;
  constructor(bucket: R2Bucket, assertApproved: () => void) { this.bucket = bucket; this.assertApproved = assertApproved; }
  async getManifest(key: string): Promise<ManifestRecord | null> {
    this.assertApproved();
    const object = await this.bucket.get(`pages/${key}/manifest.json`);
    return object ? { manifest: await object.json<PageManifest>(), etag: object.etag } : null;
  }
  async getBundle(key: string): Promise<PageBundle | null> {
    this.assertApproved();
    const object = await this.bucket.get(`artifacts/${key}.json`);
    return object ? object.json<PageBundle>() : null;
  }
  async putBundle(key: string, bundle: PageBundle): Promise<void> {
    this.assertApproved();
    await this.bucket.put(`artifacts/${key}.json`, canonicalJSON(bundle), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=31536000, immutable" } });
  }
  async putManifest(key: string, manifest: PageManifest, expectedETag: string | null): Promise<boolean> {
    this.assertApproved();
    const result = await this.bucket.put(`pages/${key}/manifest.json`, canonicalJSON(manifest), { onlyIf: expectedETag ? { etagMatches: expectedETag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-cache" } });
    return result !== null;
  }
}

export async function publishBundle(store: ArtifactStore, bundle: PageBundle, sourceCheckedAt: string, expectedETag: string | null, signal?: AbortSignal): Promise<{ manifest: PageManifest; published: boolean }> {
  await validateBundle(bundle);
  signal?.throwIfAborted();
  const bundleRevision = await revisionOf(bundle);
  const manifest: PageManifest = {
    protocolVersion: 1, pageKey: bundle.pageKey, bundleRevision, bundleURL: `/artifacts/${bundleRevision}`,
    sourceURL: bundle.sourceURL, title: bundle.title, specRevision: bundle.specRevision, recipeRevision: bundle.recipeRevision,
    contentRevision: bundle.contentRevision, capturedAt: bundle.capturedAt, sourceCheckedAt,
  };
  // Persist a complete immutable bundle before making it discoverable.
  signal?.throwIfAborted();
  await store.putBundle(bundleRevision, bundle);
  signal?.throwIfAborted();
  if (await store.putManifest(bundle.pageKey, manifest, expectedETag)) return { manifest, published: true };
  const winner = await store.getManifest(bundle.pageKey);
  if (!winner) throw new APIError("PUBLICATION_CONFLICT", "A concurrent publication changed. Retry the manifest request.", 409);
  return { manifest: winner.manifest, published: false };
}
