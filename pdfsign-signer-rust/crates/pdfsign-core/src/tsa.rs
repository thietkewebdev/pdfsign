//! RFC 3161 timestamp client (HTTP POST, application/timestamp-query).

use crate::cades::{Timestamper, OID_SHA256};
use crate::error::{Error, Result};
use cmpv2::status::PkiStatus;
use cms::signed_data::SignedData;
use der::asn1::{Int, OctetString};
use der::{Decode, Encode};
use rand::RngCore;
use spki::AlgorithmIdentifier;
use std::time::Duration;
use x509_tsp::{MessageImprint, TimeStampReq, TimeStampResp, TspVersion, TstInfo};

pub struct HttpTimestamper {
    pub url: String,
    pub timeout: Duration,
}

impl HttpTimestamper {
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into(), timeout: Duration::from_secs(30) }
    }
}

pub fn build_request(imprint: &[u8; 32], nonce: &[u8; 8]) -> Result<Vec<u8>> {
    let req = TimeStampReq {
        version: TspVersion::V1,
        message_imprint: MessageImprint {
            hash_algorithm: AlgorithmIdentifier { oid: OID_SHA256, parameters: None },
            hashed_message: OctetString::new(imprint.to_vec())?,
        },
        req_policy: None,
        nonce: Some(Int::new(nonce)?),
        cert_req: true,
        extensions: None,
    };
    Ok(req.to_der()?)
}

/// Parse a TimeStampResp, check status, imprint and nonce; return the token DER.
pub fn parse_response(resp_der: &[u8], imprint: &[u8; 32], nonce: &[u8; 8]) -> Result<Vec<u8>> {
    let resp = TimeStampResp::from_der(resp_der).map_err(|e| Error::Tsa(format!("bad response: {e}")))?;
    match resp.status.status {
        PkiStatus::Accepted | PkiStatus::GrantedWithMods => {}
        other => return Err(Error::Tsa(format!("TSA rejected request: {other:?}"))),
    }
    let token = resp.time_stamp_token.ok_or_else(|| Error::Tsa("response has no token".into()))?;
    let sd: SignedData = token.content.decode_as().map_err(|e| Error::Tsa(format!("token: {e}")))?;
    let econtent = sd.encap_content_info.econtent.ok_or_else(|| Error::Tsa("token has no TSTInfo".into()))?;
    let tst_der = OctetString::from_der(&econtent.to_der()?)?;
    let tst = TstInfo::from_der(tst_der.as_bytes()).map_err(|e| Error::Tsa(format!("TSTInfo: {e}")))?;
    if tst.message_imprint.hashed_message.as_bytes() != imprint {
        return Err(Error::Tsa("message imprint mismatch".into()));
    }
    if let Some(n) = &tst.nonce {
        if n.as_bytes() != Int::new(nonce)?.as_bytes() {
            return Err(Error::Tsa("nonce mismatch".into()));
        }
    }
    Ok(token.to_der()?)
}

impl Timestamper for HttpTimestamper {
    fn timestamp(&self, imprint: &[u8; 32]) -> Result<Vec<u8>> {
        let mut nonce = [0u8; 8];
        rand::thread_rng().fill_bytes(&mut nonce);
        nonce[0] = (nonce[0] & 0x7f) | 0x01;
        let body = build_request(imprint, &nonce)?;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(self.timeout))
            .build()
            .into();
        let mut resp = agent
            .post(&self.url)
            .header("Content-Type", "application/timestamp-query")
            .header("Accept", "application/timestamp-reply")
            .send(&body[..])
            .map_err(|e| Error::Tsa(format!("HTTP: {e}")))?;
        let bytes = resp
            .body_mut()
            .with_config()
            .limit(1024 * 1024)
            .read_to_vec()
            .map_err(|e| Error::Tsa(format!("HTTP body: {e}")))?;
        parse_response(&bytes, imprint, &nonce)
    }
}
