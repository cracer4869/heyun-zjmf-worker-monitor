import { handleEdgeOneRequest } from '../../../src/handler.js';
import { mergeEdgeOneEnv } from '../../../src/edgeone-env.js';

function resolveEdgeOneKv(env = {}) {
  try {
    if (typeof ZJMF_KV !== 'undefined') return ZJMF_KV;
    if (typeof KV !== 'undefined') return KV;
    if (typeof EDGEONE_KV !== 'undefined') return EDGEONE_KV;
  } catch {
    return env.ZJMF_KV || env.KV || env.EDGEONE_KV;
  }
  return env.ZJMF_KV || env.KV || env.EDGEONE_KV;
}

export async function onRequest(context = {}) {
  const env = context.env || {};
  const kv = resolveEdgeOneKv(env);
  return handleEdgeOneRequest(context.request, mergeEdgeOneEnv({ ...env, ZJMF_KV: kv, KV: kv, EDGEONE_KV: kv }));
}

export default onRequest;
