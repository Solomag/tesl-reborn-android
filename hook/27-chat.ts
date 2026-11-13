  // BEGIN android-ui: chat-emojis
const emojiByName = new Map(), emojiByAscii = new Map();
  let emojiDefinitions = [], emojiGroups = [], emojiAsset = null, emojiTexture = null, emojiInitAttempted = false;
  const emojiHandles = [];
  // Phone keyboard emoji -> the PC sprite with the same picture. Generated
  // from Unicode and checked against the plugin's people.json order; the
  // tail maps close relatives (coloured hearts) to the nearest sprite.
  const EMOJI_UNICODE = [["\u{1f600}","grinning"],["\u{1f603}","smiley"],["\u{1f604}","smile"],["\u{1f601}","grin"],["\u{1f606}","laughing"],["\u{1f605}","sweat_smile"],["\u{1f923}","rofl"],["\u{1f602}","joy"],["\u{1f642}","slight_smile"],["\u{1f643}","upside_down"],["\u{1fae0}","melting"],["\u{1f609}","wink"],["\u{1f60a}","blush"],["\u{1f607}","innocent"],["\u{1f970}","smiling_face_with_3_hearts"],["\u{1f60d}","heart_eyes"],["\u{1f929}","star_struck"],["\u{1f618}","kissing_heart"],["\u{1f617}","kissing"],["\u{263a}","relaxed"],["\u{1f61a}","kissing_closed_eyes"],["\u{1f619}","kissing_smiling_eyes"],["\u{1f972}","smilling_face_with_tear"],["\u{1f60b}","yum"],["\u{1f61b}","stuck_out_tongue"],["\u{1f61c}","stuck_out_tongue_winking_eye"],["\u{1f92a}","zany_face"],["\u{1f61d}","stuck_out_tongue_closed_eyes"],["\u{1f911}","money_mouth"],["\u{1f917}","hugs"],["\u{1f92d}","hand_over_mouth_closed_eyes"],["\u{1fae2}","face_with_open_eyes_and_hand_over_mouth"],["\u{1fae3}","face_with_peeking_eye"],["\u{1f92b}","shushing"],["\u{1f914}","thinking"],["\u{1fae1}","saluting"],["\u{1f910}","zipper_mouth"],["\u{1f928}","raised_eyebrow"],["\u{1f610}","neutral_face"],["\u{1f611}","expressionless"],["\u{1f636}","no_mouth"],["\u{1fae5}","dotted_line_face"],["\u{1f636}\u{200d}\u{1f32b}","face_in_clouds"],["\u{1f60f}","smirking"],["\u{1f612}","unamused"],["\u{1f644}","rolling_eyes"],["\u{1f62c}","grimacing"],["\u{1f62e}\u{200d}\u{1f4a8}","face_exhaling"],["\u{1f925}","lying_face"],["\u{1f60c}","relieved"],["\u{1f614}","pensive"],["\u{1f62a}","sleepy"],["\u{1f924}","drooling_face"],["\u{1f634}","sleeping"],["\u{1f637}","mask"],["\u{1f912}","face_with_thermometer"],["\u{1f915}","face_with_head_bandage"],["\u{1f922}","nauseated_face"],["\u{1f92e}","face_vomiting"],["\u{1f927}","sneezing_face"],["\u{1f975}","hot_face"],["\u{1f976}","cold_face"],["\u{1f974}","woozy_face"],["\u{1f635}","dizzy_face"],["\u{1f635}\u{200d}\u{1f4ab}","spiral_eyes"],["\u{1f92f}","exploding_head"],["\u{1f920}","cowboy_hat_face"],["\u{1f973}","partying_face"],["\u{1f978}","disguised_face"],["\u{1f60e}","smiling_face_with_sunglasses"],["\u{1f913}","nerd_face"],["\u{1f9d0}","face_with_monocle"],["\u{1f615}","confused"],["\u{1fae4}","face_with_diagonal_mouth"],["\u{1f61f}","worried"],["\u{1f641}","slight_frown"],["\u{2639}","frowning_face"],["\u{1f62e}","open_mouth"],["\u{1f62f}","hushed"],["\u{1f632}","astonished"],["\u{1f633}","flushed"],["\u{1f97a}","pleading_face"],["\u{1f979}","face_holding_back_tears"],["\u{1f626}","frowing"],["\u{1f627}","anguished"],["\u{1f628}","fearful"],["\u{1f630}","cold_sweat"],["\u{1f625}","disappointed_relieved"],["\u{1f622}","cry"],["\u{1f62d}","sob"],["\u{1f631}","scream"],["\u{1f616}","confounded"],["\u{1f623}","persevere"],["\u{1f61e}","disappointed"],["\u{1f613}","sweat"],["\u{1f629}","weary"],["\u{1f62b}","tired_face"],["\u{1f971}","yawning_face"],["\u{1f624}","triumph"],["\u{1f621}","rage"],["\u{1f620}","angry"],["\u{1f92c}","cursing"],["\u{1f608}","smiling_imp"],["\u{1f47f}","imp"],["\u{1f480}","skull"],["\u{2620}","skull_crossbones"],["\u{1f4a9}","shit"],["\u{1f921}","clown"],["\u{1f479}","japanese_ogre"],["\u{1f47a}","japanese_goblin"],["\u{1f47b}","ghost"],["\u{1f47d}","alien"],["\u{1f47e}","space_invader"],["\u{1f916}","robot"],["\u{1f63a}","smiley_cat"],["\u{1f638}","smile_cat"],["\u{1f639}","joy_cat"],["\u{1f63b}","heart_eyes_cat"],["\u{1f63c}","smirk_cat"],["\u{1f63d}","kissing_cat"],["\u{1f640}","scream_cat"],["\u{1f63f}","crying_cat"],["\u{1f63e}","pouting_cat"],["\u{1f648}","see_no_evil"],["\u{1f649}","hear_no_evil"],["\u{1f64a}","speak_no_evil"],["\u{1f48b}","kiss"],["\u{1f48c}","love_letter"],["\u{1f498}","cupid"],["\u{1f49d}","gift_heart"],["\u{1f496}","sparkling_heart"],["\u{1f497}","heartpulse"],["\u{1f493}","heartbeat"],["\u{1f49e}","revolving_hearts"],["\u{1f495}","two_hearts"],["\u{1f49f}","heart_decoration"],["\u{2763}","heart_exclamation"],["\u{1f494}","broken_heart"],["\u{2764}\u{200d}\u{1f525}","heart_on_fire"],["\u{2764}\u{200d}\u{1fa79}","mending_heart"],["\u{2764}","heart"],["\u{1f4af}","100"],["\u{1f4a2}","anger"],["\u{1f4a5}","boom"],["\u{1f4ab}","dizzy"],["\u{1f4a6}","sweat_drops"],["\u{1f4a8}","dash"],["\u{1f573}","hole"],["\u{1f4a3}","bomb"],["\u{1f4ac}","speech_balloon"],["\u{1f441}\u{200d}\u{1f5e8}","eye_speech_bubble"],["\u{1f5e8}","left_speech_bubble"],["\u{1f5ef}","right_anger_bubble"],["\u{1f4ad}","thought_balloon"],["\u{1f4a4}","zzz"],["\u{1f44b}","wave"],["\u{1f91a}","raised_back_of_hand"],["\u{1f590}","hand_splayed"],["\u{270b}","raised_hand"],["\u{1f596}","vulcan_salute"],["\u{1faf1}","rightwards_hand"],["\u{1faf2}","leftwards_hand"],["\u{1faf3}","palm_down_hand"],["\u{1faf4}","palm_up_hand"],["\u{1f44c}","ok_hand"],["\u{1f90c}","pinched_fingers"],["\u{1f90f}","pinching_hand"],["\u{270c}","victory_hand"],["\u{1f91e}","crossed_fingers"],["\u{1faf0}","hand_with_index_finger_and_thumb_crossed"],["\u{1f91f}","love_you_gesture"],["\u{1f918}","sign_of_the_horns"],["\u{1f919}","call_me_hand"],["\u{1f448}","backhand_index_pointing_left"],["\u{1f449}","backhand_index_pointing_right"],["\u{1f446}","backhand_index_pointing_up"],["\u{1f595}","middle_finger"],["\u{1f447}","backhand_index_pointing_down"],["\u{261d}","index_pointing_up"],["\u{1faf5}","index_pointing_at_the_viewer"],["\u{1f44d}","thumbs_up"],["\u{1f44e}","thumbs_down"],["\u{270a}","raised_fist"],["\u{1f44a}","oncoming_fist"],["\u{1f91b}","left_facing_fist"],["\u{1f91c}","right_facing_fist"],["\u{1f44f}","clapping_hands"],["\u{1f64c}","raising_hands"],["\u{1faf6}","heart_hands"],["\u{1f450}","open_hands"],["\u{1f932}","palms_up_together"],["\u{1f91d}","handshake"],["\u{1f64f}","folded_hands"],["\u{270d}","writing_hand"],["\u{1f485}","nail_care"],["\u{1f933}","selfie"],["\u{1f4aa}","muscle"],["\u{1f9be}","mechanical_arm"],["\u{1f9bf}","mechanical_leg"],["\u{1f9b5}","leg"],["\u{1f9b6}","foot"],["\u{1f442}","ear"],["\u{1f9bb}","ear_with_hearing_aid"],["\u{1f443}","nose"],["\u{1f9e0}","brain"],["\u{1fac0}","anatomical_heart"],["\u{1fac1}","lungs"],["\u{1f9b7}","tooth"],["\u{1f9b4}","bone"],["\u{1f440}","eyes"],["\u{1f441}","eye"],["\u{1f445}","tongue"],["\u{1f444}","lips"],["\u{1fae6}","biting_lip"],["\u{1f9e1}","heart"],["\u{1f49b}","heart"],["\u{1f49a}","heart"],["\u{1f499}","heart"],["\u{1f49c}","heart"],["\u{1f5a4}","heart"],["\u{1f90d}","heart"],["\u{1f90e}","heart"],["\u{1fa77}","heart"],["\u{1fa75}","heart"],["\u{1fa76}","heart"],["\u{1f642}\u{200d}\u{2194}","slight_smile"],["\u{1f642}\u{200d}\u{2195}","slight_smile"],["\u{1fae8}","dizzy_face"]];
  let emojiUnicode = null;
  // Variation selectors and skin tones have no sprite; the base emoji does.
  const EMOJI_DECORATION = /[\u{fe0e}\u{fe0f}\u{1f3fb}-\u{1f3ff}]/gu;
  const EMOJI_ANY = /[\u{2600}-\u{27bf}\u{1f000}-\u{1faff}]/u;
  function emojiFromUnicode(text) {
    if (!EMOJI_ANY.test(text)) return text;
    if (!emojiUnicode) {
      const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, ch => "\\" + ch);
      emojiUnicode = { map: new Map(EMOJI_UNICODE), pattern: new RegExp(EMOJI_UNICODE.map(([seq]) => seq)
        .sort((a, b) => b.length - a.length).map(escape).join("|"), "gu") };
    }
    const { map, pattern } = emojiUnicode;
    return text.replace(EMOJI_DECORATION, "").replace(pattern, seq => `:${map.get(seq)}:`);
  }
  function emojiIndex(definition, columns) { return (definition.Row - 1) * columns + definition.Column - 1; }
  function emojiFormat(message) {
    // PC sends this markup too. Resolve its name against the verified atlas.
    let plain = emojiFromUnicode(String(message)).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
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
      if (Checksum.compute("sha256", jsonBytes) !== EMOJI_FILES["people.json"] ||
          Checksum.compute("sha256", pngBytes) !== EMOJI_FILES["people.png"]) throw Error("Emoji resource checksum mismatch");
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
      emojiGroups = definition.Groups.map(group => ({ name: String(group.Name || ""),
        entries: group.Sprites.map(item => emojiByName.get(item.Name)) }));
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
  // The message goes out as typed, so PC players would get keyboard emoji
  // the game font cannot draw. Rewrite them to the PC :name: codes as they
  // are typed; the caret stays after the replaced text.
  let chatEmojiReports = 0;
  function chatReplaceKeyboardEmoji(record) {
    const input = record.input.target;
    const text = String(call(input, "get_text")?.content || "");
    if (text === record.lastText) return;
    const fixed = emojiFromUnicode(text);
    record.lastText = fixed;
    if (fixed === text) return;
    const caret = Math.max(0, Math.min(text.length, record.caret == null ? text.length : record.caret));
    const after = emojiFromUnicode(text.slice(caret));
    call(input, "set_text", Il2Cpp.string(fixed));
    record.caret = Math.max(0, fixed.length - after.length);
    const move = input.tryMethod("set_stringPosition", 1) || input.tryMethod("set_caretPosition", 1);
    if (move) move.invoke(record.caret);
    if (chatEmojiReports++ < 4) log(`emoji: keyboard emoji replaced (${text.length} -> ${fixed.length} chars)`);
  }
  function chatCaretTo(record, index) {
    record.caret = index;
    const input = record.input.target;
    const caret = input.tryMethod("set_stringPosition", 1) || input.tryMethod("set_caretPosition", 1);
    if (caret) caret.invoke(index);
  }
  function chatInputText(record) { return String(call(record.input.target, "get_text")?.content || ""); }
  // With the panel open the keyboard stays hidden: insert without focusing
  // the field, which would bring the keyboard back over the panel.
  function chatInputInsert(record, name) {
    const text = chatInputText(record);
    const index = Math.max(0, Math.min(text.length, record.caret == null ? text.length : record.caret));
    const insertion = `:${name}: `;
    const value = text.slice(0, index) + insertion + text.slice(index);
    call(record.input.target, "set_text", Il2Cpp.string(value));
    record.lastText = value;
    chatCaretTo(record, index + insertion.length);
  }
  // Backspace removes a whole :name: code (and its space) at once.
  function chatInputErase(record) {
    const text = chatInputText(record);
    const index = Math.max(0, Math.min(text.length, record.caret == null ? text.length : record.caret));
    if (!index) return;
    const before = text.slice(0, index);
    const code = /:([a-z0-9_]+): ?$/.exec(before);
    const cut = code && emojiByName.has(code[1]) ? code[0].length : Array.from(before).pop().length;
    const value = before.slice(0, before.length - cut) + text.slice(index);
    call(record.input.target, "set_text", Il2Cpp.string(value));
    record.lastText = value;
    chatCaretTo(record, index - cut);
  }
  // A messenger-style panel: the smiley swaps the phone keyboard for the PC
  // sprites in the keyboard's place; ABC, or a tap on the field, brings the
  // keyboard back. The panel keeps the last keyboard height.
  let chatKeyboardHeight = 0;
  function chatKeyboardWatch(record) {
    if ((record.keyboardChecks = (record.keyboardChecks || 0) + 1) % 15 !== 1) return;
    try {
      const keyboard = ucls("UnityEngine.TouchScreenKeyboard");
      if (!Boolean(keyboard.method("get_visible", 0).invoke())) return;
      const pixels = Number(keyboard.method("get_area", 0).invoke().field("m_Height").value);
      if (!(pixels > 50)) return;
      const units = pixels / Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
      if (Math.abs(units - chatKeyboardHeight) > 2) { chatKeyboardHeight = units; log(`emoji panel: keyboard height ${Math.round(pixels)} px`); }
    } catch (_) {}
  }
  const PANEL_BAR = 56;
  let chatPanelMethodsLogged = false;
  function chatPanelHeight(record) {
    const area = call(uiRect(call(record.panelParent.target, "get_gameObject")), "get_rect");
    const parent = Number(area.field("m_Height").value);
    return Math.round(Math.max(parent * 0.3, Math.min(parent * 0.6, chatKeyboardHeight || parent * 0.42)));
  }
  function chatBuildPanel(record) {
    if (record.panel) return true;
    if (!initializeEmojis()) return false;
    const started = Date.now();
    const parent = call(record.self.target, "get_transform");
    record.panelParent = parent.ref(false);
    const go = uiNew("RebornEmojiPanel", parent), rect = uiRect(go);
    record.panel = go.ref(false);
    call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 0)); call(rect, "set_pivot", vec2(0.5, 0));
    call(rect, "set_anchoredPosition", vec2(0, 0)); call(rect, "set_sizeDelta", vec2(0, chatPanelHeight(record)));
    const bg = uiAdd(go, "UnityEngine.UI.Image"); call(bg, "set_color", rgba(0.07, 0.07, 0.08, 0.98));
    const root = call(go, "get_transform");
    const width = Number(call(rect, "get_rect").field("m_Width").value);

    // Bar: one tab per group (its first sprite), then erase and ABC.
    const tab = (name, x, w, content, action) => {
      const button = uiNew(name, root); uiPlace(button, 0, 1, 0, 1, x, -6, w, PANEL_BAR - 12);
      const back = uiAdd(button, "UnityEngine.UI.Image"); call(back, "set_color", rgba(0.16, 0.16, 0.18, 1));
      const labelGO = uiNew("Label", call(button, "get_transform")); uiStretch(uiRect(labelGO));
      const label = uiText(labelGO, "", 28);
      call(label, "set_spriteAsset", emojiAsset); call(label, "set_richText", true); call(label, "set_text", Il2Cpp.string(content));
      uiButton(button, back, action);
    };
    const offsets = [];
    emojiGroups.forEach((group, i) => tab(`Group${i}`, 8 + i * 76, 68, `<sprite=${group.entries[0].index}>`, () => chatPanelScroll(record, offsets[i])));
    tab("Erase", width - 8 - 76 - 8 - 96, 96, "<size=60%>DEL</size>", () => chatInputErase(record));
    // The game sends only on the keyboard's Enter; with the keyboard hidden
    // the panel sends through the same FriendsChatWin.SendChatMessage.
    const send = record.self.target.class.methods.find(m => m.name === "SendChatMessage" && !m.isStatic);
    if (send) {
      log(`emoji panel: send is SendChatMessage(${send.parameters.map(p => p.type.name).join(", ")})`);
      // It is the input's submit handler: it takes the text and leaves the
      // field to the caller.
      const plain = send.parameterCount === 1 && send.parameters[0].type.name === "System.String";
      if (plain || send.parameterCount === 0) tab("Send", width - 8 - 76 - 8 - 96 - 8 - 120, 120, "<size=60%>SEND</size>", () => {
        const text = chatInputText(record);
        if (!text.trim()) return;
        const self = record.self.target;
        if (plain) self.method("SendChatMessage", 1).invoke(Il2Cpp.string(text)); else self.method("SendChatMessage", 0).invoke();
        const clear = self.tryMethod("ClearInputText", 0);
        if (clear) clear.invoke(); else call(record.input.target, "set_text", Il2Cpp.string(""));
        record.lastText = chatInputText(record); chatCaretTo(record, 0);
        log("emoji panel: message sent from the panel");
      });
    }
    tab("Keyboard", width - 8 - 76, 76, "<size=60%>ABC</size>", () => chatPanelShow(record, false, true));

    // Scrolling grid with a heading per group.
    const viewport = uiNew("Viewport", root), viewRect = uiRect(viewport);
    call(viewRect, "set_anchorMin", vec2(0, 0)); call(viewRect, "set_anchorMax", vec2(1, 1));
    call(viewRect, "set_offsetMin", vec2(0, 0)); call(viewRect, "set_offsetMax", vec2(0, -PANEL_BAR));
    const hit = uiAdd(viewport, "UnityEngine.UI.Image"); call(hit, "set_color", rgba(0, 0, 0, 0));
    uiAdd(viewport, "UnityEngine.UI.RectMask2D");
    const content = uiNew("Content", call(viewport, "get_transform")), contentRect = uiRect(content);
    call(contentRect, "set_anchorMin", vec2(0, 1)); call(contentRect, "set_anchorMax", vec2(1, 1)); call(contentRect, "set_pivot", vec2(0.5, 1));
    const columns = Math.max(6, Math.floor((width - 16) / 64)), cell = (width - 16) / columns;
    const contentTransform = call(content, "get_transform");
    let y = 0;
    emojiGroups.forEach((group, g) => {
      offsets[g] = y;
      const heading = uiNew(`Heading${g}`, contentTransform); uiPlace(heading, 0, 1, 0, 1, 14, -y, width - 28, 32);
      const label = uiText(heading, uiPlain(group.name), 18);
      call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "Left")); call(label, "set_color", rgba(0.7, 0.7, 0.72, 1));
      y += 34;
      group.entries.forEach((entry, i) => {
        const item = uiNew(entry.Name, contentTransform);
        const pad = Math.round(cell * 0.14);
        uiPlace(item, 0, 1, 0, 1, 8 + (i % columns) * cell + pad, -(y + Math.floor(i / columns) * cell + pad), cell - 2 * pad, cell - 2 * pad);
        const icon = uiAdd(item, "UnityEngine.UI.RawImage"); call(icon, "set_texture", emojiTexture);
        call(icon, "set_uvRect", unityStruct("UnityEngine.Rect", { m_XMin: entry.u, m_YMin: entry.v, m_Width: entry.du, m_Height: entry.dv }));
        const button = uiButton(item, icon, () => chatInputInsert(record, entry.Name));
        const transition = button.tryMethod("set_transition", 1);
        if (transition) transition.invoke(enumBox(transition.parameters[0].type.class, 0));
      });
      y += Math.ceil(group.entries.length / columns) * cell + 8;
    });
    call(contentRect, "set_sizeDelta", vec2(0, y));
    const scroll = uiAdd(viewport, "UnityEngine.UI.ScrollRect");
    call(scroll, "set_content", contentRect); call(scroll, "set_viewport", viewRect);
    call(scroll, "set_horizontal", false); call(scroll, "set_vertical", true);
    record.panelScroll = scroll.ref(false); record.panelContent = contentRect.ref(false);
    call(go, "SetActive", false);
    const area = call(uiRect(call(parent, "get_gameObject")), "get_rect"), screen = chatScreen();
    log(`emoji panel: built ${emojiDefinitions.length} sprites, ${columns} columns, ${Date.now() - started} ms; ` +
      `host ${Math.round(Number(area.field("m_Width").value))}x${Math.round(Number(area.field("m_Height").value))} ` +
      `screen ${screen.width}x${screen.height} scale ${Number(call(record.canvas.target, "get_scaleFactor")).toFixed(2)}`);
    if (!chatPanelMethodsLogged) {
      chatPanelMethodsLogged = true;
      log(`emoji panel: chat window methods ${record.self.target.class.methods.map(m => m.name).join(",")}`);
      let hide = "?";
      try { hide = String(call(record.input.target, "get_shouldHideMobileInput")); } catch (_) {}
      const where = uiXY(call(record.rect.target, "get_anchoredPosition")), size = call(record.rect.target, "get_rect");
      log(`emoji panel: input ${record.input.target.class.name} hideMobileInput=${hide}; window at ${Math.round(where.x)},${Math.round(where.y)} ` +
        `size ${Math.round(Number(size.field("m_Width").value))}x${Math.round(Number(size.field("m_Height").value))}`);
    }
    return true;
  }
  function chatPanelScroll(record, offset) {
    call(record.panelScroll.target, "StopMovement");
    call(record.panelContent.target, "set_anchoredPosition", vec2(0, offset || 0));
  }
  function chatPanelShow(record, show, keyboard = false) {
    if (show && !chatBuildPanel(record)) return;
    record.panelOpen = show;
    if (record.pickerLabel) call(record.pickerLabel.target, "set_text", Il2Cpp.string(show ? "<size=45%>ABC</size>" : "<sprite=8>"));
    if (!record.panel) return;
    const panel = record.panel.target;
    if (show) {
      const height = chatPanelHeight(record);
      call(uiRect(panel), "set_sizeDelta", vec2(0, height));
      call(panel, "SetActive", true);
      try { chatPanelLift(record, height); } catch (error) { log(`emoji panel: lift failed: ${error}`); }
      call(call(panel, "get_transform"), "SetAsLastSibling");
      record.panelOpenedAt = Date.now();
      const input = record.input.target;
      const off = input.tryMethod("DeactivateInputField", 0) || input.tryMethod("DeactivateInputField", 1);
      if (off) { if (off.parameterCount) off.invoke(false); else off.invoke(); }
    } else {
      call(panel, "SetActive", false);
      chatPanelDrop(record);
      if (keyboard) call(record.input.target, "ActivateInputField");
    }
  }
  // The panel takes the bottom of the screen, where the chat input usually
  // is: raise the window until its input clears the panel, and put it back
  // when the panel closes.
  function chatPanelLift(record, height) {
    const scale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
    const camera = call(record.canvas.target, "get_worldCamera");
    const inputRect = uiRect(call(record.input.target, "get_gameObject"));
    // RectTransformUtility.WorldToScreenPoint is stripped from this build;
    // the camera's own method does the same (an overlay canvas has none and
    // its world position is already in screen pixels).
    const world = call(call(inputRect, "get_transform"), "get_position");
    const project = isNull(camera) ? null : camera.tryMethod("WorldToScreenPoint", 1);
    const center = uiXY(project ? project.invoke(world) : world);
    const pixels = Number(call(inputRect, "get_rect").field("m_Height").value) * scale * (record.factor || 1);
    const pivot = Number(call(inputRect, "get_pivot").field("y").value);
    const bottom = center.y - pivot * pixels;
    const lift = (height * scale + 12 - bottom) / scale;
    if (!(lift > 0)) return;
    const rect = record.rect.target, at = record.desired || uiXY(call(rect, "get_anchoredPosition"));
    record.panelLift = { from: { x: at.x, y: at.y }, to: { x: at.x, y: at.y + lift } };
    record.desired = record.panelLift.to;
    chatApplyPosition(record);
    log(`emoji panel: chat raised by ${Math.round(lift)} for the panel`);
  }
  function chatPanelDrop(record) {
    const lift = record.panelLift;
    if (!lift) return;
    record.panelLift = null;
    // Moved while the panel was open: keep where the player put it.
    if (record.desired === lift.to) { record.desired = lift.from; chatApplyPosition(record); }
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
      if (unityAlive(kept.window.target) && unityAlive(kept.input.target)) {
        if (kept.panelOpen) try { chatPanelShow(kept, false); } catch (_) {}
        return;
      }
      chatWindows.delete(key);
      for (const name of ["window", "rect", "input", "canvas", "controls", "handle", "pickerLabel", "pickerButton",
        "panel", "panelParent", "panelScroll", "panelContent"]) try { kept[name]?.free(); } catch (_) {}
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
        dragging: false, caret: null, errors: 0, panel: null, panelOpen: false, desired: null, handle: handle.ref(false) };
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
      record.pickerLabel = label.ref(false);
      const pickerButton = uiButton(picker, hit, () => chatPanelShow(record, !record.panelOpen, true));
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
        chatReplaceKeyboardEmoji(record);
        chatKeyboardWatch(record);
        if (record.panelOpen && Date.now() - record.panelOpenedAt > 400) chatPanelShow(record, false);
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
