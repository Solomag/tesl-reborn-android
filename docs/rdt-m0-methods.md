# RDT Android M0: game methods and fields

This table lists names, signatures and fields from the Android Il2CppDumper dump (`E:\tr\dump\dump.cs`). It contains no code. The image is `Assembly-CSharp` unless another image is named. "Found" means the item is in the dump with a body, so it can be attached or called.

## Match history

| Asked for | Android | Status |
|---|---|---|
| `LogMessageTranslator.AddHistoryQueue(HistoryQueue)` | `SPTESL.LogMessageTranslator : MonoBehaviour`<br>`public void AddHistoryQueue(HistoryQueue queue)` | found |
| `CcgRpc.HistoryQueue` | `CcgRpc.HistoryQueue : IMessage<HistoryQueue>`<br>`static MessageParser<HistoryQueue> Parser { get; }`<br>`RepeatedField<HistoryItem> Queue { get; }` | found |
| `Parser.ParseFrom(byte[])` | `Google.Protobuf.MessageParser<T>.ParseFrom(byte[] data)`<br>non-generic `MessageParser.ParseFrom(ByteString)` | found |
| `MessageExtensions.ToByteArray(IMessage)` | **stripped.**<br>`Google.Protobuf.MessageExtensions` has only `MergeFrom(IMessage, byte[])` and `MergeFrom(IMessage, ByteString)`. | missing |
| Alternative for serialising | Build the bytes from these:<br>`IMessage.CalculateSize()`<br>`new CodedOutputStream(byte[] flatArray)`<br>`IMessage.WriteTo(CodedOutputStream)`<br>`CodedOutputStream.Flush()`<br>All of these are present on every message class. | found |

The queue item type is `CcgRpc.HistoryItem`. Its properties are listed below.
- `HistoryType Type`
- `int ActingPlayerInstanceId`
- `int ActorCardNetUid`
- `int TargetCardNetUid`
- `int AssetHash`
- `int EffectTriggerType`
- `int PlayerAttributeName`
- `int PlayerAttributeValue`
- `int GameZoneName`
- `int DrainTargetCardNetUid`
- `RepeatedField<HistoryPlayer> AffectedPlayersArray`
- `RepeatedField<HistoryCard> AffectedCardsArray`
- `RepeatedField<HistoryLane> AffectedLanesArray`
- `int TestSubtype`
- `CardCommandItem CardCommandItem`
- `FullGameState FullGameState`
- `HistoryInputVisualization InputVisualization`
- `RepeatedField<HistoryPlayerDescription> MatchIntroPlayers`
- `RepeatedField<MessageDynamicCardLane> MatchIntroLanes`
- `bool MulliganDisabled`
- `bool IsBonusMatch`
- `bool IsLegendsMatch`
- `Doinker DoinkerInformation`
- `int DialogueId`
- `FloatingCards FloatingCardsUpdate`
- `bool IgnoredByClientLog`
- `SanitizeRule SanitizeRule`
- `int MechanicType`
- `int EquipCardNetUid`
- `bool UseProphecyBanner`
- `bool UseActingLane`
- `int ActingLaneType`
- `int ActingLaneIndex`
- `int TimeRemainingMillisecondsUpdate`
- `int InitialAllowedMillisecondsUpdate`

`CcgRpc.HistoryCard` has the properties below.
- `int CardNetUid`
- `CardPosition CurrentPosition`
- `bool IsFullState`
- `bool Silenced`
- `int CardId`
- `int CurrentHealth`
- `RepeatedField<int>` pairs:
  - `AffectedAttributeName` / `AffectedAttributeValue`
  - `AffectedRareAttributeName` / `AffectedRareAttributeValue`
  - `BaseOverrideAttributeName` / `BaseOverrideAttributeValue`
- `RepeatedField<Enchantment> Enchantments`
- `RepeatedField<TreasureHuntState> HuntStates`
- `RepeatedField<Hanger> Hangers`
- `RepeatedField<CardLink> Links`
- `int OverrideCardId`
- `bool IsPremium`
- `bool UseCurrentHealth`
- `int TotalAbilityUses`
- `int CreatorCardId`
- `int PreviousGameZoneType`
- `int ItemOwnerNetUid`
- `bool GrantsAuras`
- `bool HasHealthDebuff`
- `bool HasPowerDebuff`
- `bool HasCostDebuff`
- `RepeatedField<HistoryCard> ComponentCards`
- `bool IsRevealed`
- `bool HideAuraStatusFx`

`CurrentPosition` has the type `CcgRpc.CardPosition`, with these properties.
- `int OwningPlayerUid`
- `int GameZoneName`
- `int GameZoneType`
- `int LaneIndex`
- `int PositionIndex`

`AffectedPlayersArray` is made of `CcgRpc.HistoryPlayer`, with these properties.
- `bool IsFullState`
- `int PlayerUid`
- `int DeckCardCount`
- `RepeatedField<int>` pairs:
  - `AttributeNames` / `AttributeValues`
  - `RareAttributeNames` / `RareAttributeValues`
  - `ActionLevelCardIds` / `ActionLevelValues`
- `RepeatedField<string> Spectators`
- `bool ValidDeckCount`
- `RepeatedField<string> DualSpectators`

`MatchIntroPlayers` is made of `CcgRpc.HistoryPlayerDescription`, with these properties.
- `int PlayerInstanceId`
- `string PlayerName`
- `int AiOpponentId`
- `RepeatedField<int> DeckColorNames`
- `RepeatedField<string> InventoryTypes` / `RepeatedField<string> InventoryValues`
- `int Health`
- `bool IsHuman`
- `int NumStartingRunes`
- `int Rank`
- `int LegendRank`
- `string VoOverride`
- `bool ArenaBonusMatch`

`CcgRpc.FullGameState` has these properties.
- `RepeatedField<FullPlayerState> PlayerStates`
- `bool NeverExclude`
- `HistoryQueue HistoryQueue`
- `int CurrentTurnPlayerId`
- `bool DuringMulligan`

`FullGameState` has no `Lanes` or `Cards` of its own. Cards are reached through the player states, by this path:
1. `CcgRpc.FullPlayerState` has `HistoryPlayer Player`, `RepeatedField<NetStaticGameZone> StaticGameZones` and `RepeatedField<NetDynamicGameZone> DynamicGameZones`.
2. `NetStaticGameZone` and `NetDynamicGameZone` each have `int ZoneName`, `int ZoneType`, `int TotalCardCount` and `Lanes`.
   - The static zone's lanes are `RepeatedField<MessageStaticCardLane>`.
   - The dynamic zone's lanes are `RepeatedField<MessageDynamicCardLane>`.
3. `MessageStaticCardLane` has these properties:
   - `RepeatedField<HistoryCard> Cards`
   - `int LaneType`
   - `int LaneSize`
4. `MessageDynamicCardLane` has these properties:
   - `RepeatedField<HistoryCard> Cards`
   - `int LaneType`
   - `int LaneSize`
   - `int ExtraLaneType`
   - `int ZoneName`
   - `int LaneIndex`
5. `CcgRpc.HistoryLane` (the items of `AffectedLanesArray`) has these properties:
   - `int PlayerInstanceId`
   - `int ZoneName`
   - `int ZoneType`
   - `int LaneIndex`
   - `int LaneType`
   - `int ExtraLaneType`

## Match UI and network

| Asked for | Android | Status |
|---|---|---|
| `CardListPicker.LateUpdate` | `SPTESL.CardListPicker : MonoBehaviour`<br>`private void LateUpdate()`<br>`public void SetData(List<ClientCard> clientCards, List<int> usableCardIds, bool collapse, bool singleSelect, bool allowCancel)` | found |
| `CardListItem.SetData` | `SPTESL.CardListItem : MonoBehaviour`<br>`public void SetData(CardListPicker.CardItemData data)` | found |
| `MatchUI.SetCardListPickerData` | `SPTESL.MatchUI`<br>`public void SetCardListPickerData(List<ClientCard> clientCards, MatchUI.CardListPickerType pickerType, List<int> usableCardIds, bool collapse, bool singleSelect, bool allowCancel = false)` | found |
| `PlayerInfoPanel.SetPlayerDeckIconInteract` | `PlayerInfoPanel` (global namespace)<br>`public void SetPlayerDeckIconInteract(bool canInteract)` | found |
| `GameNetworkManager.SendCheat(CheatRequest)` | `SPTESL.GameNetworkManager`<br>`public void SendCheat(CheatRequest cheat)` | found |
| `GameNetworkManager._matchId` | `private string _matchId`<br>Also on the same class:<br>`static Instance`<br>`HistoryQueue ReplayHistory`<br>`List<HistoryQueue> _historyMessages`<br>`PlayerUniqueId _localPlayerUid`<br>`bool _isSpectating` | found |
| `BoardConductor.BoardState` | `SPTESL.BoardConductor`<br>`public BoardState BoardState` (field)<br>Also on the same class:<br>`MatchUI MatchUI_PC`<br>`MatchUI MatchUI_Mobile`<br>`GameHistoryLog GameHistoryLog`<br>`Action<PlayerControllerType> OnDeckIconPressed` | found |

`SPTESL.ClientCard` is the type the card picker receives. Its properties are listed below.
- `CardNetUid NetUid`
- `int CardId`
- `int OverrideCardId`
- `PlayerUniqueId OwnerNetId`
- `int CreatorCardId`
- `GameZoneName GameZoneName`
- `int CurrentHealth`
- `int TotalAbilityUses`
- `bool Silenced`
- `bool GrantsAuras`
- `bool HideAuraStatusFx`
- `bool HasHealthDebuff`
- `bool HasPowerDebuff`
- `bool HasCostDebuff`
- `bool IsRevealed`
- `CardNetUid ItemTarget`
- `Card BaseCard`
- `Card OverrideCard`

## Deck inventory and card data (what the PC `GameData.cs` reads)

The path is the same as on PC: `SparkleServices.ServicesManager` → `Inventory` → `InventoryDescription`.

| Asked for | Android | Status |
|---|---|---|
| Services manager | `SparkleServices.ServicesManager : Singleton<ServicesManager>`<br>`get_Instance()` | found (the hook already uses it) |
| Inventory | `ServicesManager.Inventory` (public field, type `Inventory`) | found |
| Inventory description | `Inventory.InventoryDescription { get; }`<br>backing field `_inventoryDescription`<br>also `Dictionary<int, Inventory.CardType> CardTypeLookup { get; }` | found |
| `InventoryDesc` | `int deckLimit`<br>`List<Inventory.Deck> decks`<br>`List<Inventory.CardType> cardTypes` | found |
| Deck | `Inventory.Deck`:<br>`long id`<br>`private string displayName`, with a `DisplayName` property<br>`List<Inventory.Deck.DeckCard> cards`<br>`int artTypeHash`<br>`int deckTypeHash`<br>`bool isValid`<br>`long eventId`<br>`int[] magickaHistogram` | found |
| Deck card | `Inventory.Deck.DeckCard`:<br>`int typeHash`<br>`int numRegular`<br>`int numPremium` | found |
| Card type | `Inventory.CardType`:<br>`readonly int TypeHash`<br>`string TypeName`<br>`string ExportCode`<br>`int AlternateOfCardTypeHash`<br>`Inventory.CardType AlternateOfCardType`<br>`List<ColorSubType> ColorSubTypes`<br>`Rarity CardRarity`<br>`int MaxCopiesOrig`<br>`ClientCardData ClientCardData` | found |
| Card display data | `SparkleServices.ClientCardData`:<br>`Name`<br>`Description` (card text)<br>`Image`<br>`bool Unique`<br>`int ManaCost`<br>`List<TrackedSubType> TrackedSubTypes` | found |
| Match-side definition | `SPTESL.CardDefinition : Entity`:<br>`string Name`<br>`DeckType AllowedDeck`<br>`List<CardSubtype> Subtypes`<br>`List<TriggeredEffect> TriggeredEffects`<br>`List<Aura> Auras` | found |

The dump has no plain attack or health fields on the card definitions. In a match, these values are in the `HistoryCard` attribute pairs (`AffectedAttributeName`/`Value`). The base values are on `Entity`/`Card` attributes. If RDT needs base attack and health outside a match, ask for those classes next.

## What the Reborn hook already attaches on this path

- **Nothing attaches to `AddHistoryQueue`, `HistoryQueue` or `GameNetworkManager` message handling.** No other hook module does either. A shared dispatcher is therefore not needed. RDT can attach `AddHistoryQueue` through `teslPort.hookAttach`.
- **`hook/26-history-and-match-intro.ts` attaches only these points:**
  - `MatchEntry.UpdateUi` / `SetData(SparkleServices.Stats.MatchEntry)`, for the match history screen tooltips.
  - `SparkleServices.ServicesManager.Update` (onLeave, through the shared frame-leave list), as a poll.
  - `SequenceMatchIntro.Execute(MatchLogAnimationData, BoardState)`, onEnter, which only remembers its arguments.
  - `MatchIntroWin.Show()`, to tint the title banners. It reads `ActionData.MatchIntroPlayers` and `GameNetworkManager.GetPlayerControllerType`.
- **Attaching `ServicesManager.Update` (no onEnter) is already shared.** `hookAttach` in `hook/03-hook-plumbing.ts` merges every onLeave-only attach on the same frame method into one listener. RDT should use `teslPort.frameGate` instead of its own attach on Update.
