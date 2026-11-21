use crate::error::{AppError, AppResult};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectPct {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Placement {
    pub page: PageSpec,
    #[serde(rename = "rectPct")]
    pub rect_pct: RectPct,
}

#[derive(Debug, Clone)]
pub enum PageSpec {
    Last,
    Number(u32),
}

impl Serialize for PageSpec {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            PageSpec::Last => serializer.serialize_str("LAST"),
            PageSpec::Number(n) => serializer.serialize_u32(*n),
        }
    }
}

impl<'de> Deserialize<'de> for PageSpec {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(deserializer)?;
        match v {
            Value::String(s) if s.eq_ignore_ascii_case("last") => Ok(PageSpec::Last),
            Value::Number(n) => {
                let n = n
                    .as_u64()
                    .ok_or_else(|| serde::de::Error::custom("page invalid"))?;
                if n < 1 {
                    return Err(serde::de::Error::custom("page must be >= 1"));
                }
                Ok(PageSpec::Number(n as u32))
            }
            _ => Err(serde::de::Error::custom("page must be number or LAST")),
        }
    }
}

impl Placement {
    pub fn normalize(raw: &Value) -> AppResult<Self> {
        let obj = raw
            .as_object()
            .ok_or_else(|| AppError::bad("placement must be an object"))?;

        let page = match obj.get("page") {
            Some(Value::String(s)) if s.eq_ignore_ascii_case("last") => PageSpec::Last,
            Some(Value::Number(n)) => {
                let n = n
                    .as_u64()
                    .ok_or_else(|| AppError::bad("placement.page invalid"))?;
                if n < 1 {
                    return Err(AppError::bad("placement.page must be >= 1"));
                }
                PageSpec::Number(n as u32)
            }
            _ => PageSpec::Last,
        };

        let rect_src = obj.get("rectPct").unwrap_or(raw);
        let rect_obj = rect_src
            .as_object()
            .ok_or_else(|| AppError::bad("placement.rectPct must be object"))?;

        let get = |keys: &[&str]| -> AppResult<f64> {
            for k in keys {
                if let Some(v) = rect_obj.get(*k) {
                    let n = v
                        .as_f64()
                        .ok_or_else(|| AppError::bad(format!("placement.rectPct.{k} invalid")))?;
                    if !(0.0..=1.0).contains(&n) {
                        return Err(AppError::bad(format!(
                            "placement.rectPct.{k} must be 0..1"
                        )));
                    }
                    return Ok(n);
                }
            }
            Err(AppError::coded(
                StatusCode::BAD_REQUEST,
                "INVALID_PLACEMENT",
                "placement.rectPct must be { x, y, w, h } with 4 numeric values 0..1",
            ))
        };

        Ok(Placement {
            page,
            rect_pct: RectPct {
                x: get(&["x", "xPct"])?,
                y: get(&["y", "yPct"])?,
                w: get(&["w", "wPct"])?,
                h: get(&["h", "hPct"])?,
            },
        })
    }

    pub fn to_json(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}
