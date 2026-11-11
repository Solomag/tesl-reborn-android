  // BEGIN android-ui: chat-emojis
const emojiByName = new Map(), emojiByAscii = new Map();
  let emojiDefinitions = [], emojiAsset = null, emojiTexture = null, emojiInitAttempted = false;
  const emojiHandles = [];
  function emojiIndex(definition, columns) { return (definition.Row - 1) * columns + definition.Column - 1; }
  function emojiFormat(message) {
    // PC sends this markup too. Resolve its name against the verified atlas.
    let plain = String(message).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
    plain = uiPlain(plain);
    plain = plain.split(" ").map(word => emojiByAscii.has(word) ? `:${emojiByAscii.get(word)}:` : word).join(" ");
    return plain.replace(/:([a-z0-9_]+):/gi, (whole, name) => {
      const definition = emojiByName.get(name);
      return definition ? `<size=130%><sprite=${definition.index}></size>` : whole;
    });
  }
  function initializeEmojis() {
    if (emojiAsset) return true;
    if (emojiInitAttempted) return false;
    emojiInitAttempted = true;
    try {
      const path = `${persistentPath()}/tesl-reborn-emojis`;
      const jsonBytes = File.readAllBytes(`${path}/people.json`), pngBytes = File.readAllBytes(`${path}/people.png`);
      if (Checksum.compute("sha256", jsonBytes) !== "ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d" ||
          Checksum.compute("sha256", pngBytes) !== "95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa") throw Error("Emoji resource checksum mismatch");
      const definition = JSON.parse(File.readAllText(`${path}/people.json`));
      const shader = ucls("UnityEngine.Shader").method("Find", 1).invoke(Il2Cpp.string("TextMeshPro/Sprite"));
      if (isNull(shader)) throw Error("TextMeshPro/Sprite shader is unavailable");
      const texture = ucls("UnityEngine.Texture2D").alloc();
      emojiHandles.push(texture.ref(false));
      texture.method(".ctor").overload("System.Int32", "System.Int32", "UnityEngine.TextureFormat", "System.Boolean")
        .invoke(2, 2, enumBox(ucls("UnityEngine.TextureFormat"), 4), false);
      const managedBytes = Il2Cpp.corlib.class("System.IO.File").method("ReadAllBytes", 1).invoke(Il2Cpp.string(`${path}/people.png`));
      const loaded = ucls("UnityEngine.ImageConversion").method("LoadImage").overload("UnityEngine.Texture2D", "System.Byte[]").invoke(texture, managedBytes);
      if (!loaded) throw Error("PNG decoding failed");
      const width = Number(call(texture, "get_width")), height = Number(call(texture, "get_height"));
      const columns = width / definition.SpriteSize, rows = height / definition.SpriteSize;
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns * rows > 4096) throw Error("Invalid emoji atlas dimensions");
      const material = ucls("UnityEngine.Material").alloc();
      emojiHandles.push(material.ref(false));
      material.method(".ctor").overload("UnityEngine.Shader").invoke(shader);
      call(material, "set_mainTexture", texture);
      const asset = ucls("UnityEngine.ScriptableObject").method("CreateInstance").overload("System.Type").invoke(ucls("TMPro.TMP_SpriteAsset").type.object);
      emojiHandles.push(asset.ref(false));
      asset.field("spriteSheet").value = texture; asset.field("material").value = material;
      const list = uiList(ucls("TMPro.TMP_Sprite"));
      emojiHandles.push(list.ref(false));
      for (let i = 0; i < columns * rows; i++) call(list, "Add", NULL);
      const definitions = definition.Groups.flatMap(group => group.Sprites);
      for (const item of definitions) {
        if (item.Row < 1 || item.Column < 1 || item.Row > rows || item.Column > columns || !/^[a-z0-9_]+$/.test(item.Name))
          throw Error("Invalid emoji definition");
        const index = emojiIndex(item, columns), sprite = newWith(ucls("TMPro.TMP_Sprite"));
        const spriteHandle = sprite.ref(false);
        const fields = { id: index, name: Il2Cpp.string(item.Name), unicode: index,
          x: (item.Column - 1) * definition.SpriteSize, y: height - item.Row * definition.SpriteSize,
          width: definition.SpriteSize, height: definition.SpriteSize, xOffset: 0,
          yOffset: definition.SpriteSize * 0.8, xAdvance: definition.SpriteSize, scale: 1 };
        for (const [key, value] of Object.entries(fields)) sprite.field(key).value = value;
        list.method("set_Item", 2).invoke(index, sprite);
        spriteHandle.free();
        const entry = Object.assign({}, item, { index, u: (item.Column - 1) / columns, v: 1 - item.Row / rows, du: 1 / columns, dv: 1 / rows });
        emojiByName.set(item.Name, entry);
        for (const ascii of String(item.Ascii || "").split(" ").filter(Boolean)) emojiByAscii.set(ascii, item.Name);
      }
      asset.field("spriteInfoList").value = list;
      emojiDefinitions = definitions.map(item => emojiByName.get(item.Name));
      emojiAsset = asset; emojiTexture = texture;
      // Report 23: the GL context is rebuilt after the background and a
      // texture made at runtime comes back blank; decode it again.
      (globalThis.__teslOnResume ??= []).push(() => {
        const bytes = Il2Cpp.corlib.class("System.IO.File").method("ReadAllBytes", 1).invoke(Il2Cpp.string(`${path}/people.png`));
        const again = ucls("UnityEngine.ImageConversion").method("LoadImage").overload("UnityEngine.Texture2D", "System.Byte[]").invoke(texture, bytes);
        log(`emoji: atlas ${again ? "reloaded" : "reload failed"} after resume`);
      });
      log(`emoji: initialized ${emojiDefinitions.length} sprites from PC atlas`);
      return true;
    } catch (error) { emojiByName.clear(); emojiByAscii.clear(); log(`emoji: initialization failed: ${error}`); return false; }
  }
  const chatMessages = new Map();
  let chatMessageReports = 0;
  function chatResetTextRect(rect) {
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_pivot", vec2(0.5, 0.5));
    call(rect, "set_sizeDelta", vec2(-16, -8)); call(rect, "set_anchoredPosition", vec2(0, 0));
  }
  function chatFitTextBox(record) {
    const row = call(record.rect.target, "get_rect"), box = call(record.textRect.target, "get_rect");
    const expectedWidth = Number(row.field("m_Width").value) - 16;
    const expectedHeight = Number(row.field("m_Height").value) - 8;
    if (Math.abs(Number(box.field("m_Width").value) - expectedWidth) > 0.5 ||
        Math.abs(Number(box.field("m_Height").value) - expectedHeight) > 0.5) {
      chatResetTextRect(record.textRect.target);
      if (record.boxRepairs++ < 2) log("chat UI: repaired TMP text container bounds");
    }
  }
  function chatPrepareViewport(self) {
    const root = call(self, "get_transform");
    const viewport = call(root, "Find", Il2Cpp.string("Window/Section_TopBigChat/Section_Messages/Panel_Messages/Scroll_Messages/Viewport"));
    if (isNull(viewport)) { log("chat UI: viewport path missing"); return; }
    const go = call(viewport, "get_gameObject");
    ucls("UnityEngine.UI.RectMask2D"); // Check availability before disabling the original mask.
    let rectangle = uiComponent(go, "UnityEngine.UI.RectMask2D");
    if (isNull(rectangle)) rectangle = uiAdd(go, "UnityEngine.UI.RectMask2D");
    const mask = uiComponent(go, "UnityEngine.UI.Mask");
    if (!isNull(mask)) call(mask, "set_enabled", false);
    const image = uiComponent(go, "UnityEngine.UI.Image");
    if (!isNull(image)) call(image, "set_enabled", false);
    call(rectangle, "set_enabled", true);
    log("chat UI: PC viewport mask fix applied (Mask off, Image off, RectMask2D on)");
  }
  function chatLogMessageBounds(record) {
    try {
      let rect = call(record.text.target, "get_rectTransform");
      for (let depth = 0; depth < 7 && !isNull(rect); depth++) {
        const name = String(call(rect, "get_name")?.content || "?");
        const area = call(rect, "get_rect"), point = uiXY(call(rect, "get_anchoredPosition"));
        const scale = uiXY(call(rect, "get_localScale")), pivot = uiXY(call(rect, "get_pivot"));
        log(`chat UI geometry: ${depth}:${name} rect=${Number(area.field("m_Width").value).toFixed(1)}x${Number(area.field("m_Height").value).toFixed(1)} pos=${point.x.toFixed(1)},${point.y.toFixed(1)} pivot=${pivot.x.toFixed(1)},${pivot.y.toFixed(1)} scale=${scale.x.toFixed(2)},${scale.y.toFixed(2)}`);
        const parent = call(rect, "get_parent");
        if (isNull(parent)) break;
        rect = uiRect(call(parent, "get_gameObject"));
      }
    } catch (error) { log(`chat UI: geometry probe failed: ${error}`); }
  }
  function chatResizeMessage(record) {
    const row = record.row.target, text = record.text.target;
    if (isNull(row) || isNull(text)) return;
    const rect = record.rect.target;
    const area = call(rect, "get_rect");
    const width = Math.max(32, Number(area.field("m_Width").value) - 16);
    if (Math.abs(width - record.width) < 0.5 && record.height > 0) {
      const currentHeight = Number(area.field("m_Height").value);
      if (Math.abs(currentHeight - record.height) > 0.5) {
        call(record.layout.target, "set_preferredHeight", record.height);
        call(record.layout.target, "set_minHeight", record.height);
        call(record.layout.target, "set_flexibleHeight", 0);
        const delta = uiXY(call(rect, "get_sizeDelta"));
        call(rect, "set_sizeDelta", vec2(delta.x, delta.y + record.height - currentHeight));
      }
      chatFitTextBox(record);
      return;
    }
    let height;
    const preferred = text.tryMethod("GetPreferredValues", 3);
    if (preferred) height = uiXY(preferred.overload("System.String", "System.Single", "System.Single")
      .invoke(Il2Cpp.string(record.value), width, 100000)).y;
    else height = Number(call(text, "get_preferredHeight"));
    height = Math.ceil(Math.max(28, height) + 8);
    if (!Number.isFinite(height) || height > 20000) throw Error("Invalid chat message height");
    if (Math.abs(height - record.height) > 0.5 || Math.abs(width - record.width) > 0.5) {
      call(record.layout.target, "set_preferredHeight", height);
      call(record.layout.target, "set_minHeight", height);
      call(record.layout.target, "set_flexibleHeight", 0);
      const currentHeight = Number(area.field("m_Height").value), delta = uiXY(call(rect, "get_sizeDelta"));
      call(rect, "set_sizeDelta", vec2(delta.x, delta.y + height - currentHeight));
      record.height = height; record.width = width;
    }
    chatFitTextBox(record);
  }
  let armChatSizes = (_on) => {};
  function chatRefreshMessageSizes() {
    for (const [key, record] of chatMessages) {
      try {
        if (unityAlive(record.row.target)) {
          if (Boolean(call(call(record.row.target, "get_gameObject"), "get_activeInHierarchy"))) chatResizeMessage(record);
          continue;
        }
      } catch (error) {
        if (!record.warned) { record.warned = true; log(`chat UI: message layout failed: ${error}`); }
      }
      for (const handle of [record.row, record.text, record.rect, record.layout, record.textRect]) handle.free();
      chatMessages.delete(key);
    }
    armChatSizes(chatMessages.size > 0);
  }
  function renderChatMessage(row, message) {
    if (!initializeEmojis()) return;
    const legacy = row.field("_input").value;
    if (isNull(legacy)) return;
    const template = call(legacy, "get_textComponent");
    if (isNull(template)) return;
    const key = row.handle.toString();
    let record = chatMessages.get(key);
    if (!record) {
      // The old InputField moves its text rectangle for horizontal scrolling.
      // A message renderer must use the row's bounds, not that shifted rectangle.
      const rowGO = call(row, "get_gameObject"), rowRect = uiRect(rowGO);
      const go = uiNew("RebornEmojiMessage", call(rowGO, "get_transform")), rect = uiRect(go);
      call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const text = uiText(go, "", 22);
      // AddComponent<TMP> can reset sizeDelta to its default (observed +200,+50).
      // Configure the container AFTER component creation, independently of font auto-sizing.
      const autoContainer = text.tryMethod("set_autoSizeTextContainer", 1);
      let containerConfigured = false;
      if (autoContainer) { try { autoContainer.invoke(false); containerConfigured = true; } catch (_) {} }
      if (!containerConfigured) { try { text.field("m_autoSizeTextContainer").value = false; } catch (_) {} }
      call(text, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "TopLeft"));
      call(text, "set_raycastTarget", true); // ScrollRect needs a raycast target after the viewport Image is disabled.
      call(text, "set_enableWordWrapping", true); call(text, "set_richText", true);
      call(text, "set_spriteAsset", emojiAsset);
      chatResetTextRect(rect);
      let layout = uiComponent(rowGO, "UnityEngine.UI.LayoutElement");
      if (isNull(layout)) layout = uiAdd(rowGO, "UnityEngine.UI.LayoutElement");
      const parent = call(rowRect, "get_parent");
      const group = uiComponent(call(parent, "get_gameObject"), "UnityEngine.UI.VerticalLayoutGroup");
      if (!isNull(group)) {
        call(group, "set_childControlHeight", true); call(group, "set_childForceExpandHeight", false);
        call(group, "set_childControlWidth", true); call(group, "set_childForceExpandWidth", true);
        call(group, "set_childAlignment", enumBox(ucls("UnityEngine.TextAnchor"), 0));
      }
      record = { row: row.weakRef(false), text: text.ref(false), rect: rowRect.ref(false), layout: layout.ref(false), textRect: rect.ref(false),
        width: -1, height: -1, value: "", warned: false, boxRepairs: 0 };
      chatMessages.set(key, record); armChatSizes(true);
      if (chatMessages.size <= 2) schedule(500, () => chatLogMessageBounds(record));
    }
    const username = String(message.field("Username").value?.content || "");
    const body = String(message.field("Text").value?.content || "");
    const value = `${username ? `<b>${uiPlain(username)}</b>\n` : ""}${emojiFormat(body)}`;
    if (record.value !== value) { record.value = value; record.width = -1; record.height = -1; }
    call(record.text.target, "set_text", Il2Cpp.string(value));
    chatResizeMessage(record);
    // Keep the native object and its event wiring, but stop InputField text scrolling.
    call(legacy, "set_enabled", false);
    call(template, "set_enabled", false);
    if (chatMessageReports++ < 4) log(`chat UI: message fitted height=${record.height}; row-relative bounds`);
  }
  section("chat emoji rendering", () => {
    const klass = cls(img, "ChatMessageEntry");
    const method = klass.methods.find(m => m.name === "SetData" && m.parameterCount >= 1 && !m.isStatic);
    if (!method || method.parameters[0].type.class.isValueType) throw Error("ChatMessageEntry.SetData reference Message not found");
    hookAttach(method.virtualAddress, {
      onEnter(args) { this.row = args[0]; this.message = args[1]; },
      onLeave() { try { renderChatMessage(new Il2Cpp.Object(this.row), new Il2Cpp.Object(this.message)); }
        catch (error) { log(`emoji: message rendering failed: ${error}`); } }
    });
  });


  section("chat message layout refresh", () => {
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) {
      // New messages are sized when rendered; the per-message Unity calls of a
      // full pass cost ~2 ms on slower phones, so re-check only every 200 ms.
      // The gate runs it every 200 ms while chat rows are tracked.
      armChatSizes = gatedHook(render.virtualAddress, "enter", chatRefreshMessageSizes, 200);
      armChatSizes(chatMessages.size > 0);
    } else {
      const tick = () => { chatRefreshMessageSizes(); schedule(100, tick, "chat message sizes"); }; schedule(100, tick, "chat message sizes");
    }
  });
// END android-ui: chat-emojis

  // BEGIN android-ui: message-preview
const messagePreviews = new Map();
  let messagePreviewReports = 0;
  function emojiPreviewFormat(source, richText) {
    // Preserve native name/time/style markup, and use the same name->sprite map as chat.
    const normalized = String(source).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
    if (!richText) return emojiFormat(normalized);
    return normalized.split(/(<\/?(?:b|i|size|color)(?:=[^<>]*)?>)/gi)
      .map(part => /^<\/?(?:b|i|size|color)(?:=[^<>]*)?>$/i.test(part) ? part : emojiFormat(part)).join("");
  }
  function messagePreviewBounds(record) {
    const rect = record.rect.target;
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_pivot", vec2(0.5, 0.5)); call(rect, "set_sizeDelta", vec2(0, 0));
    call(rect, "set_anchoredPosition", vec2(0, 0));
  }
  function refreshMessagePreview(record) {
    const template = record.template.target, label = record.label.target;
    if (isNull(template) || isNull(label)) return false;
    let source = String(call(template, "get_text")?.content || "");
    if (!source) source = record.fallbackText;
    const richText = Boolean(call(template, "get_supportRichText"));
    if (source !== record.source || richText !== record.richText) {
      call(label, "set_text", Il2Cpp.string(emojiPreviewFormat(source, richText)));
      record.source = source; record.richText = richText;
    }
    const fontSize = Number(call(template, "get_fontSize"));
    if (fontSize > 0 && fontSize !== record.fontSize) { call(label, "set_fontSize", fontSize); record.fontSize = fontSize; }
    // Native preview fade/colour animations can target the legacy graphic itself.
    call(label, "set_color", call(template, "get_color"));
    try {
      const originalRenderer = call(template, "get_canvasRenderer"), renderer = call(label, "get_canvasRenderer");
      call(renderer, "SetColor", call(originalRenderer, "GetColor"));
    } catch (_) {}
    const parentArea = call(call(template, "get_rectTransform"), "get_rect");
    const area = call(record.rect.target, "get_rect");
    if (Math.abs(Number(area.field("m_Width").value) - Number(parentArea.field("m_Width").value)) > 0.5 ||
        Math.abs(Number(area.field("m_Height").value) - Number(parentArea.field("m_Height").value)) > 0.5) messagePreviewBounds(record);
    call(template, "set_enabled", false); // Keep the original GameObject, layout and click handlers active.
    return true;
  }
  function dropMessagePreview(key, record) {
    try { if (!isNull(record.template.target)) call(record.template.target, "set_enabled", true); } catch (_) {}
    try { if (!isNull(record.label.target)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(record.label.target, "get_gameObject")); } catch (_) {}
    for (const handle of [record.row, record.template, record.label, record.rect]) handle.free();
    messagePreviews.delete(key);
  }
  function renderMessagePreview(row, message) {
    // A preview may arrive before chat assets/shaders have been loaded. Do not
    // consume the chat's one initialization attempt while the sprite shader is absent.
    if (!emojiAsset) {
      try {
        if (isNull(ucls("UnityEngine.Shader").method("Find", 1).invoke(Il2Cpp.string("TextMeshPro/Sprite")))) return;
      } catch (_) { return; }
    }
    if (!initializeEmojis()) return;
    const template = row.field("_text").value;
    if (isNull(template)) return;
    const key = row.handle.toString();
    let record = messagePreviews.get(key);
    if (record && (isNull(record.template.target) || record.template.target.handle.toString() !== template.handle.toString())) {
      dropMessagePreview(key, record); record = null;
    }
    if (!record) {
      let go = null;
      try {
        go = uiNew("PreviewRichText", call(template, "get_transform"));
        call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        const label = uiText(go, "", 22);
        const autoContainer = label.tryMethod("set_autoSizeTextContainer", 1);
        let configured = false;
        if (autoContainer) { try { autoContainer.invoke(false); configured = true; } catch (_) {} }
        if (!configured) { try { label.field("m_autoSizeTextContainer").value = false; } catch (_) {} }
        call(label, "set_richText", true); call(label, "set_raycastTarget", true);
        call(label, "set_enableWordWrapping", enumVal(call(template, "get_horizontalOverflow")) === 0);
        const alignments = ["TopLeft", "Top", "TopRight", "Left", "Center", "Right", "BottomLeft", "Bottom", "BottomRight"];
        const alignment = enumVal(call(template, "get_alignment"));
        call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", alignments[alignment] || "TopLeft"));
        const overflow = label.method("set_overflowMode", 1);
        overflow.invoke(enumBox(overflow.parameters[0].type.class, 3)); // Truncate, same as PC MessagePreviewEntryPatch.
        call(label, "set_spriteAsset", emojiAsset);
        record = { row: row.weakRef(false), template: template.weakRef(false), label: label.ref(false), rect: uiRect(go).ref(false),
          fallbackText: "", source: null, richText: null, fontSize: null };
        messagePreviewBounds(record); // Always AFTER TMP creation and configuration.
        messagePreviews.set(key, record); armPreviews(true);
      } catch (error) {
        if (go) { try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(go); } catch (_) {} }
        throw error;
      }
    }
    const username = String(message.field("Username").value?.content || "");
    const body = String(message.field("Text").value?.content || "");
    record.fallbackText = `${username ? `${username}: ` : ""}${body}`;
    refreshMessagePreview(record);
    if (messagePreviewReports++ < 4) log("emoji preview: rendered with shared chat sprite atlas");
  }
  let armPreviews = (_on) => {};
  function refreshMessagePreviews() {
    for (const [key, record] of messagePreviews) {
      try {
        if (unityAlive(record.row.target) && unityAlive(record.template.target)) {
          if (Boolean(call(call(record.template.target, "get_gameObject"), "get_activeInHierarchy"))) refreshMessagePreview(record);
          continue;
        }
      } catch (error) {
        try { if (!isNull(record.template.target)) call(record.template.target, "set_enabled", true); } catch (_) {}
        log(`emoji preview: refresh failed: ${error}`);
      }
      dropMessagePreview(key, record);
    }
    armPreviews(messagePreviews.size > 0);
  }
  section("message preview emoji rendering", () => {
    const klass = cls(img, "MessagePreviewEntry");
    const methods = klass.methods.filter(m => m.name === "SetData" && !m.isStatic && m.parameterCount >= 1 &&
      m.parameters[0].type.class.name === "Message" && !m.parameters[0].type.class.isValueType && !m.virtualAddress.isNull());
    if (!methods.length) throw Error("MessagePreviewEntry.SetData(Message, ...) not found");
    const seen = new Set();
    for (const method of methods) {
      const address = method.virtualAddress.toString(); if (seen.has(address)) continue; seen.add(address);
      hookAttach(method.virtualAddress, {
        onEnter(args) { this.row = args[0]; this.message = args[1]; },
        onLeave() { try { renderMessagePreview(new Il2Cpp.Object(this.row), new Il2Cpp.Object(this.message)); }
          catch (error) { log(`emoji preview: rendering failed: ${error}`); } }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) { armPreviews = gatedHook(render.virtualAddress, "enter", refreshMessagePreviews); armPreviews(messagePreviews.size > 0); }
    else { const tick = () => { refreshMessagePreviews(); schedule(100, tick, "message previews"); }; schedule(100, tick, "message previews"); }
    log(`emoji preview: hooks installed callbacks=${seen.size}`);
  });
// END android-ui: message-preview

  // BEGIN android-ui: chat-scale
function chatScaleApply(record) {
    if (!record.baseScale || !Number.isFinite(record.factor)) return;
    const rect = record.rect.target, current = call(rect, "get_localScale"), base = record.baseScale;
    const x = base.x * record.factor, y = base.y * record.factor;
    if (Math.abs(Number(current.field("x").value) - x) > 0.001 || Math.abs(Number(current.field("y").value) - y) > 0.001)
      call(rect, "set_localScale", unityStruct("UnityEngine.Vector3", { x, y, z: base.z }));
  }
  function chatScaleSetup(record) {
    const rect = record.rect.target, scale = call(rect, "get_localScale");
    record.baseScale = { x: Number(scale.field("x").value) || 1, y: Number(scale.field("y").value) || 1,
      z: Number(scale.field("z").value) || 1 };
    const area = call(rect, "get_rect"), screen = chatScreen();
    const canvasScale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
    record.maxFactor = Math.max(0.45, Math.min(1.8,
      (screen.width / canvasScale - 24) / Math.max(1, Number(area.field("m_Width").value) * Math.abs(record.baseScale.x)),
      (screen.height / canvasScale - 24) / Math.max(1, Number(area.field("m_Height").value) * Math.abs(record.baseScale.y))));
    record.factor = Math.min(1, record.maxFactor);
    try {
      const saved = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-chat-scale.json`) || "null");
      if (saved && Number.isFinite(saved.factor)) record.factor = Math.max(0.45, Math.min(record.maxFactor, saved.factor));
    } catch (_) {}
    record.scaleEnabled = true;
    chatScaleApply(record);
    log(`chat UI: scale enabled range=0.45..${record.maxFactor.toFixed(2)}; pinch only`);
  }
  function chatScaleSet(record, factor) {
    record.factor = Math.max(0.45, Math.min(record.maxFactor, factor)); chatScaleApply(record);
  }
  function chatScaleSave(record) {
    writeTextFile(`${persistentPath()}/tesl-reborn-chat-scale.json`, JSON.stringify({ factor: record.factor }));
    log(`chat UI: scale saved factor=${record.factor.toFixed(2)}`);
  }
  // Report 11: the chat cost 27-77 ms/s with its window open, mostly method
  // lookups and input queries repeated every frame. Resolve them once.
  let chatInputMethods = null;
  function chatInput() {
    if (!chatInputMethods) {
      const input = ucls("UnityEngine.Input");
      chatInputMethods = { touchCount: input.method("get_touchCount", 0), getTouch: input.method("GetTouch", 1) };
    }
    return chatInputMethods;
  }
  function chatScaleUpdate(record, count) {
    if (!record.scaleEnabled) return false;
    const input = chatInput();
    if (count === undefined) count = Number(input.touchCount.invoke());
    if (count >= 2) {
      const camera = call(record.canvas.target, "get_worldCamera");
      const a = input.getTouch.invoke(0), b = input.getTouch.invoke(1);
      const ap = uiXY(a.method("get_position", 0).invoke()), bp = uiXY(b.method("get_position", 0).invoke());
      const phases = [a, b].map(t => enumVal(t.method("get_phase", 0).invoke()));
      if (phases.some(p => p === 3 || p === 4)) {
        if (record.pinch) { record.pinch = null; chatScaleSave(record); } return true;
      }
      if (!record.pinch) {
        if (!chatContains(record.rect.target, ap, camera) || !chatContains(record.rect.target, bp, camera)) return false;
        record.pinch = { distance: Math.max(1, Math.hypot(ap.x - bp.x, ap.y - bp.y)), factor: record.factor };
        record.dragging = false; record.armed = false;
      }
      chatScaleSet(record, record.pinch.factor * Math.hypot(ap.x - bp.x, ap.y - bp.y) / record.pinch.distance);
      return true;
    }
    if (record.pinch) { record.pinch = null; chatScaleSave(record); return true; }
    return false;
  }
// END android-ui: chat-scale

  // BEGIN android-ui: chat-window
const chatWindows = new Map();
  const chatSetupDiagnosed = new Set();
  function chatInputInsert(record, name) {
    const input = record.input.target;
    const text = String(call(input, "get_text")?.content || "");
    const index = Math.max(0, Math.min(text.length, record.caret == null ? text.length : record.caret));
    const insertion = `:${name}: `;
    call(input, "set_text", Il2Cpp.string(text.slice(0, index) + insertion + text.slice(index)));
    record.caret = index + insertion.length;
    const caret = input.tryMethod("set_stringPosition", 1) || input.tryMethod("set_caretPosition", 1);
    if (caret) caret.invoke(record.caret);
    call(input, "ActivateInputField");
  }
  function chatBuildPicker(record) {
    if (record.picker) return true;
    if (!initializeEmojis()) return false;
    const go = uiNew("RebornEmojiPicker", record.window.target);
    uiPlace(go, 1, 0, 1, 0, -16, 84, 284, 250);
    call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
    const bg = uiAdd(go, "UnityEngine.UI.Image"); call(bg, "set_color", rgba(0.08, 0.08, 0.08, 0.98));
    const root = call(go, "get_transform");
    record.picker = go.ref(false); record.page = 0; record.cells = [];
    for (let i = 0; i < 48; i++) {
      const cell = uiNew(`Emoji${i}`, root);
      uiPlace(cell, 0, 1, 0, 1, 6 + (i % 8) * 34, -6 - Math.floor(i / 8) * 34, 30, 30);
      const icon = uiAdd(cell, "UnityEngine.UI.RawImage"); call(icon, "set_texture", emojiTexture);
      uiButton(cell, icon, () => {
        const entry = emojiDefinitions[record.page * 48 + i];
        if (!entry) return;
        chatInputInsert(record, entry.Name); call(record.picker.target, "SetActive", false);
      });
      record.cells.push({ object: cell.ref(false), image: icon.ref(false) });
    }
    uiLabeledButton("Previous", root, "<", -196, -216, 68, () => chatPickerPage(record, -1));
    uiLabeledButton("Next", root, ">", -112, -216, 68, () => chatPickerPage(record, 1));
    uiLabeledButton("Close", root, "X", -8, -216, 68, () => call(record.picker.target, "SetActive", false));
    chatPickerPage(record, 0);
    call(go, "SetActive", false);
    return true;
  }
  function chatPickerPage(record, delta) {
    const pages = Math.ceil(emojiDefinitions.length / 48);
    record.page = (record.page + delta + pages) % pages;
    for (let i = 0; i < record.cells.length; i++) {
      const entry = emojiDefinitions[record.page * 48 + i], cell = record.cells[i];
      call(cell.object.target, "SetActive", !!entry);
      if (!entry) continue;
      call(cell.image.target, "set_uvRect", unityStruct("UnityEngine.Rect", {
        m_XMin: entry.u, m_YMin: entry.v, m_Width: entry.du, m_Height: entry.dv
      }));
    }
    log(`emoji: picker page ${record.page + 1}/${pages}`);
  }
  function chatFind(root, path) {
    const value = call(root, "Find", Il2Cpp.string(path));
    if (isNull(value)) throw Error(`Chat UI path missing: ${path}`);
    return value;
  }
  function chatSetup(self) {
    const key = self.handle.toString();
    // Report 102: after battles the chat had no emoji button. A record kept
    // for a window destroyed with its scene (its address since reused)
    // blocked the setup of the new one.
    const kept = chatWindows.get(key);
    if (kept) {
      if (unityAlive(kept.window.target) && unityAlive(kept.input.target)) return;
      chatWindows.delete(key);
      for (const name of ["window", "rect", "input", "canvas", "controls", "handle"]) try { kept[name]?.free(); } catch (_) {}
    }
    let controls = null, pickerCreated = null, createdRecord = null;
    try {
      const root = call(self, "get_transform"), window = chatFind(root, "Window");
      const inputTransform = chatFind(root, "Window/Section_BottomSmallChat/Input_Message");
      const inputGO = call(inputTransform, "get_gameObject");
      let input = uiComponent(inputGO, "TMPro.TMP_InputField");
      if (isNull(input)) input = uiComponent(inputGO, "UnityEngine.UI.InputField");
      if (isNull(input)) throw Error("Chat input component not found");
      const canvas = window.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
      if (isNull(canvas)) throw Error("Chat canvas not found");
      const windowGO = call(window, "get_gameObject"), rect = uiRect(windowGO);
      // Drag the existing player header. Keep Move only as a prefab fallback.
      const header = call(root, "Find", Il2Cpp.string("Window/Section_TopBigChat/Section_PlayerInfo"));
      let handle;
      if (!isNull(header)) handle = uiRect(call(header, "get_gameObject"));
      else {
        controls = uiNew("RebornChatControls", window); uiPlace(controls, 0.5, 1, 0.5, 1, 0, -3, 70, 28);
        call(uiAdd(controls, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        handle = uiRect(uiLabeledButton("MoveChat", call(controls, "get_transform"), "Move", 0, 0, 70, () => {}));
      }
      const record = { self: self.weakRef(false), window: window.ref(false), rect: rect.ref(false),
        input: input.ref(false), canvas: canvas.ref(false), controls: (controls || windowGO).ref(false),
        dragging: false, caret: null, errors: 0, picker: null, desired: null, handle: handle.ref(false) };
      createdRecord = record;
      // Same smiley (sprite index 8), 46x46 size and input-relative placement as PC.
      const picker = uiNew("EmojiPickerButton", inputTransform);
      pickerCreated = picker;
      uiPlace(picker, 1, 1, 1, 0, -16, -63, 46, 46);
      call(uiAdd(picker, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const hit = uiAdd(picker, "UnityEngine.UI.Image");
      call(hit, "set_color", rgba(1, 1, 1, 0));
      const labelGO = uiNew("Label", call(picker, "get_transform"));
      uiStretch(uiRect(labelGO));
      const label = uiText(labelGO, "", 30);
      if (initializeEmojis()) {
        call(label, "set_spriteAsset", emojiAsset);
        call(label, "set_richText", true);
        call(label, "set_text", Il2Cpp.string("<sprite=8>"));
      } else call(label, "set_text", Il2Cpp.string(":)"));
      // No colour transition on an invisible hit target; the sprite is the label.
      const pickerButton = uiButton(picker, hit, () => {
        if (!chatBuildPicker(record)) return;
        const panel = record.picker.target;
        call(panel, "SetActive", !Boolean(call(panel, "get_activeSelf")));
        if (Boolean(call(panel, "get_activeSelf"))) call(call(panel, "get_transform"), "SetAsLastSibling");
      });
      const transition = pickerButton.tryMethod("set_transition", 1);
      if (transition) transition.invoke(enumBox(transition.parameters[0].type.class, 0));
      record.pickerButton = uiRect(picker).ref(false);
      // Ignore positions from v9: the failed bounds calculation could leave one invalid.
      try {
        const saved = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-chat-position-v11.json`) || "null");
        const screen = chatScreen();
        if (saved && saved.width === screen.width && saved.height === screen.height &&
            Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          record.desired = { x: saved.x, y: saved.y };
          call(rect, "set_anchoredPosition", vec2(saved.x, saved.y));
        }
      } catch (_) {}
      chatWindows.set(key, record);
      try { chatPrepareViewport(self); } catch (error) { log(`chat UI: viewport preparation failed: ${error}`); }
      try { chatScaleSetup(record); } catch (error) { log(`chat UI: scale setup failed: ${error}`); }
      log(`chat UI: drag=${controls ? "Move fallback" : "player header"}; PC smiley installed`);
    } catch (error) {
      for (const object of [controls, pickerCreated]) if (object) {
        try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(object); } catch (_) {}
      }
      if (createdRecord) for (const value of Object.values(createdRecord)) {
        if (value && typeof value.free === "function") { try { value.free(); } catch (_) {} }
      }
      log(`chat UI: setup failed: ${error}`);
      if (!chatSetupDiagnosed.has(key)) {
        chatSetupDiagnosed.add(key);
        try { uiLogTree(call(self, "get_transform"), "chat UI paths"); } catch (_) {}
      }
    }
  }
  function chatContains(rect, point, camera) {
    return Boolean(ucls("UnityEngine.RectTransformUtility").method("RectangleContainsScreenPoint")
      .overload("UnityEngine.RectTransform", "UnityEngine.Vector2", "UnityEngine.Camera")
      .invoke(rect, vec2(point.x, point.y), camera));
  }
  function chatScreen() {
    const screen = ucls("UnityEngine.Screen");
    return { width: Number(screen.method("get_width", 0).invoke()), height: Number(screen.method("get_height", 0).invoke()) };
  }
  function chatBoundPointer(point) {
    // Bound the grabbed handle, not the full Window RectTransform. On mobile that
    // rect may stretch across the viewport even when the visible chat is small.
    const screen = chatScreen();
    return { x: Math.max(16, Math.min(screen.width - 16, point.x)),
      y: Math.max(16, Math.min(screen.height - 16, point.y)) };
  }
  function chatApplyPosition(record) {
    if (!record.desired) return;
    const rect = record.rect.target, current = uiXY(call(rect, "get_anchoredPosition"));
    if (Math.abs(current.x - record.desired.x) > 0.1 || Math.abs(current.y - record.desired.y) > 0.1)
      call(rect, "set_anchoredPosition", vec2(record.desired.x, record.desired.y));
  }
  let armChatRender: (on: boolean) => void = () => {};
  function chatUpdate(self) {
    const record = chatWindows.get(self.handle.toString());
    if (!record || record.errors > 3) return;
    try {
      // A call on a destroyed object aborts the game through the hook.
      if (!unityAlive(record.controls.target)) { chatWindows.delete(self.handle.toString()); return; }
      if (!Boolean(call(record.controls.target, "get_activeInHierarchy"))) return;
      record.renderPending = true; armChatRender(true);
      const touches = Number(chatInput().touchCount.invoke());
      if (chatScaleUpdate(record, touches)) return;
      const input = record.input.target;
      if (Boolean(call(input, "get_isFocused"))) {
        if (record.caretMethod === undefined) record.caretMethod = input.tryMethod("get_stringPosition", 0) || input.tryMethod("get_caretPosition", 0) || null;
        if (record.caretMethod) record.caret = Number(record.caretMethod.invoke());
      }
      const unityInput = ucls("UnityEngine.Input");
      let point, held, down;
      if (touches > 0) {
        const touch = chatInput().getTouch.invoke(0);
        point = uiXY(touch.method("get_position", 0).invoke());
        const phase = enumVal(touch.method("get_phase", 0).invoke());
        down = phase === 0; // Began; independent of simulateMouseWithTouches.
        held = phase !== 3 && phase !== 4; // Ended / Canceled.
      } else if (!record.armed && !record.dragging) {
        // A phone has no mouse: with no touch and nothing in progress there
        // is nothing to read.
        record.errors = 0; return;
      } else {
        point = uiXY(unityInput.method("get_mousePosition").invoke());
        held = Boolean(unityInput.method("GetMouseButton", 1).invoke(0));
        down = Boolean(unityInput.method("GetMouseButtonDown", 1).invoke(0));
      }
      const camera = call(record.canvas.target, "get_worldCamera");
      const rect = record.rect.target;
      if (down && Boolean(call(call(record.handle.target, "get_gameObject"), "get_activeInHierarchy")) && chatContains(record.handle.target, point, camera)) {
        record.armed = true; record.start = point; record.origin = uiXY(call(rect, "get_anchoredPosition"));
      }
      if (record.armed && held && !record.dragging && Math.hypot(point.x - record.start.x, point.y - record.start.y) >= 8) {
        record.dragging = true;
        log("chat UI: drag started");
      }
      if (record.dragging && held) {
        const scale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
        const bounded = chatBoundPointer(point);
        record.desired = { x: record.origin.x + (bounded.x - record.start.x) / scale,
          y: record.origin.y + (bounded.y - record.start.y) / scale };
        chatApplyPosition(record);
      }
      if (record.dragging && !held) {
        record.dragging = false;
        const screen = chatScreen();
        writeTextFile(`${persistentPath()}/tesl-reborn-chat-position-v11.json`, JSON.stringify(Object.assign({}, record.desired, screen)));
        log("chat UI: position saved");
      }
      if (!held) record.armed = false;
      // The chosen position and scale are restored after native Update in the
      // canvas render hook, once per frame.
      if (down && record.picker && Boolean(call(record.picker.target, "get_activeSelf")) &&
          !chatContains(uiRect(record.picker.target), point, camera) && !chatContains(record.pickerButton.target, point, camera))
        call(record.picker.target, "SetActive", false);
      record.errors = 0;
    } catch (error) { record.errors++; record.dragging = false; log(`chat UI: update failed: ${error}`); }
  }
  section("movable chat and emoji picker", () => {
    const klass = cls(img, "FriendsChatWin");
    const update = klass.methods.find(m => m.name === "Update" && !m.isStatic && m.parameterCount === 0);
    if (!update) throw Error("FriendsChatWin.Update not found");
    for (const method of klass.methods.filter(m => ["Awake", "Show"].includes(m.name) && !m.isStatic)) {
      if (method.virtualAddress.isNull()) continue;
      hookAttach(method.virtualAddress, {
        onEnter(args) { this.self = args[0]; },
        onLeave() { try { chatSetup(new Il2Cpp.Object(this.self)); } catch (error) { log(`chat UI: ${error}`); } }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    // Report 23: this runs several times a frame (310/s at 104 FPS). The
    // window's Update already found it active; apply once after that. The
    // listener enters JS only after such an Update.
    if (render && !render.virtualAddress.isNull()) armChatRender = gatedHook(render.virtualAddress, "leave", () => {
      armChatRender(false);
      for (const record of chatWindows.values()) {
        if (!record.renderPending) continue;
        record.renderPending = false;
        try { chatApplyPosition(record); chatScaleApply(record); } catch (_) {}
      }
    });
    hookAttach(update.virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() { try { chatUpdate(new Il2Cpp.Object(this.self)); } catch (_) {} }
    });
  });
