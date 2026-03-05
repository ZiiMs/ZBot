use serde_json::json;

use crate::interaction::CustomId;

#[test]
fn custom_id_round_trip() {
    let cid = CustomId {
        feature: "reminders".to_string(),
        action: "create".to_string(),
        version: 1,
        payload: json!({"guild_id": 1, "content": "hello"}),
    };

    let encoded = cid.encode().expect("encode should work");
    let decoded = CustomId::decode(&encoded).expect("decode should work");

    assert_eq!(decoded.feature, "reminders");
    assert_eq!(decoded.action, "create");
    assert_eq!(decoded.version, 1);
}
