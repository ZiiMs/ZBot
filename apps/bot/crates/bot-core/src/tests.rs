use serde_json::json;

use crate::interaction::CustomId;
use crate::{WelcomeRenderContext, render_welcome_template};

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

#[test]
fn welcome_template_replaces_known_tokens() {
    let context = WelcomeRenderContext {
        user: "Alice".to_string(),
        server: "Guild One".to_string(),
        mention: "<@123>".to_string(),
    };

    let result = render_welcome_template(
        "Welcome {mention} ({user}) to **{server}**!",
        &context,
    );

    assert_eq!(result.content, "Welcome <@123> (Alice) to **Guild One**!");
    assert_eq!(result.used_variables, vec!["mention", "server", "user"]);
    assert!(result.unknown_placeholders.is_empty());
}

#[test]
fn welcome_template_preserves_unknown_tokens() {
    let context = WelcomeRenderContext {
        user: "Alice".to_string(),
        server: "Guild One".to_string(),
        mention: "<@123>".to_string(),
    };

    let result = render_welcome_template("Hi {user} {foo} {bar}", &context);

    assert_eq!(result.content, "Hi Alice {foo} {bar}");
    assert_eq!(result.used_variables, vec!["user"]);
    assert_eq!(result.unknown_placeholders, vec!["bar", "foo"]);
}
