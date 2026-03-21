/**
 * Signing sessions with USB token can take longer in real use
 * (select certificate, verify PIN, open signer, upload back).
 */
export const SIGNING_JOB_EXPIRES_MINUTES = 90;
