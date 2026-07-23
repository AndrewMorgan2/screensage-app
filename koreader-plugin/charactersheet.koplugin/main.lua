--[[--
Character Sheet - fetches a DCC character sheet from ScreenSage's Kindle API
(see src/kindle_handlers.rs) and renders it natively in KOReader, full-screen,
no browser chrome involved.

@module koplugin.CharacterSheet
--]]--

local Blitbuffer = require("ffi/blitbuffer")
local Button = require("ui/widget/button")
local ButtonDialog = require("ui/widget/buttondialog")
local Device = require("device")
local Font = require("ui/font")
local FrameContainer = require("ui/widget/container/framecontainer")
local Geom = require("ui/geometry")
local HorizontalGroup = require("ui/widget/horizontalgroup")
local HorizontalSpan = require("ui/widget/horizontalspan")
local InfoMessage = require("ui/widget/infomessage")
local InputContainer = require("ui/widget/container/inputcontainer")
local KeyValuePage = require("ui/widget/keyvaluepage")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local ProgressWidget = require("ui/widget/progresswidget")
local ScrollableContainer = require("ui/widget/container/scrollablecontainer")
local Size = require("ui/size")
local TextBoxWidget = require("ui/widget/textboxwidget")
local TextWidget = require("ui/widget/textwidget")
local UIManager = require("ui/uimanager")
local VerticalGroup = require("ui/widget/verticalgroup")
local VerticalSpan = require("ui/widget/verticalspan")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local http = require("socket.http")
local ltn12 = require("ltn12")
local socket = require("socket")
local socketutil = require("socketutil")
local JSON = require("json")
local _ = require("gettext")
local Screen = Device.screen

-- ScreenSage's normal port. Not the standalone kindle-sheet project's 8000 -
-- see docs/KOREADER_KINDLE_PLUGIN.md for the distinction between the two.
local DEFAULT_SERVER = "http://192.168.12.1:8080"

-- KOReader's bundled JSON library decodes JSON `null` as a self-referential
-- function sentinel (json.util.null), not Lua nil, so `ability.uses` is
-- truthy even when JSON had `"uses": null`. Check the real type instead.
local function hasUses(ability)
    return type(ability.uses) == "table"
end

--[[--
Full-screen scrollable view of one character's sheet. Built fresh each time
(no in-place updates) - simpler to reason about than patching an existing
widget tree after a POST changes the character's state. Which ability (if
any) is expanded inline lives on the plugin instance so it survives rebuilds.
--]]
local SheetView = InputContainer:extend{
    character = nil,
    plugin = nil, -- back-reference for button callbacks
}

function SheetView:init()
    local screen_w, screen_h = Screen:getWidth(), Screen:getHeight()
    local c = self.character
    local plugin = self.plugin
    local content_width = screen_w - 2 * Size.padding.large

    -- Top bar: Switch Character pinned far left, Close pinned far right.
    local switch_btn = Button:new{
        text = _("Switch Character"),
        callback = function()
            UIManager:close(self)
            plugin:switchCharacter()
        end,
    }
    local close_btn = Button:new{
        text = _("Close"),
        callback = function()
            UIManager:close(self)
        end,
    }
    local gap_w = content_width - switch_btn:getSize().w - close_btn:getSize().w
    local top_bar = HorizontalGroup:new{
        switch_btn,
        HorizontalSpan:new{ width = math.max(0, gap_w) },
        close_btn,
    }

    local rows = VerticalGroup:new{}
    local row_width = content_width - ScrollableContainer:getScrollbarWidth()

    local function addText(text, size, bold)
        table.insert(rows, TextWidget:new{
            text = text,
            face = Font:getFace("cfont", size),
            bold = bold,
        })
    end

    -- No "large" span size below vertical_large in KOReader's Size module,
    -- so `large` picks that for section breaks; the default (tight) spacing
    -- is used for everything else, including in the ability drop-down.
    local function addSpan(large)
        table.insert(rows, VerticalSpan:new{
            width = large and Size.span.vertical_large or Size.span.vertical_default,
        })
    end

    local function addRowButton(text, callback)
        table.insert(rows, Button:new{
            text = text,
            menu_style = true,
            width = row_width,
            callback = callback,
        })
    end

    -- Border-less inline text, used for the expanded ability "drop down".
    local function addPlainText(text, size)
        table.insert(rows, TextBoxWidget:new{
            text = text,
            face = Font:getFace("cfont", size),
            width = row_width,
        })
    end

    -- ScreenSage stores stats/combat as plain JSON objects (unlike the
    -- standalone kindle-sheet project's ordered [key, value] arrays), so
    -- iteration order here isn't guaranteed stable across loads.
    local function addKVObject(tbl)
        if not tbl then
            return
        end
        for k, v in pairs(tbl) do
            addText(k .. ": " .. tostring(v), 18, false)
        end
        addSpan()
    end

    addText(c.name, 26, true)
    local sub = c.class .. " - Level " .. tostring(c.level)
    if c.alignment then
        sub = sub .. " - " .. c.alignment
    end
    addText(sub, 18, false)
    addSpan()

    addRowButton(
        _("HP: ") .. tostring(c.hp.current) .. " / " .. tostring(c.hp.max) .. "  (tap to adjust)",
        function() plugin:showHPDialog() end
    )
    addSpan(true)
    local hp_ratio = c.hp.max > 0 and (c.hp.current / c.hp.max) or 0
    table.insert(rows, ProgressWidget:new{
        width = row_width,
        height = Size.item.height_default / 2,
        percentage = hp_ratio,
        fillcolor = Blitbuffer.COLOR_DARK_GRAY,
    })
    addSpan()

    addKVObject(c.stats)
    addKVObject(c.combat)

    for _, ability in ipairs(c.abilities) do
        local label = ability.name
        if hasUses(ability) then
            label = label .. " (" .. tostring(ability.uses.current) .. "/" .. tostring(ability.uses.max) .. ")"
        end
        label = label .. " - " .. ability.type
        addRowButton(label, function() plugin:toggleAbility(ability.id) end)

        if plugin.expanded_ability_id == ability.id then
            addSpan(true)
            addPlainText(ability.description, 18)
            if hasUses(ability) then
                addSpan(true)
                addText(
                    _("Uses remaining: ") .. tostring(ability.uses.current) .. " / " .. tostring(ability.uses.max),
                    16, false
                )
                addSpan(true)
                table.insert(rows, HorizontalGroup:new{
                    Button:new{
                        text = _("Use"),
                        enabled = ability.uses.current > 0,
                        callback = function() plugin:useAbility(ability.id, "use") end,
                    },
                    HorizontalSpan:new{ width = Size.span.horizontal_default },
                    Button:new{
                        text = _("Reset"),
                        callback = function() plugin:useAbility(ability.id, "reset") end,
                    },
                })
            end
            addSpan()
        end
    end

    local top_bar_h = top_bar:getSize().h
    local scroll_h = screen_h - top_bar_h - Size.span.vertical_large - 2 * Size.padding.large

    self.cropping_widget = ScrollableContainer:new{
        dimen = Geom:new{ w = content_width, h = scroll_h },
        show_parent = self,
        rows,
    }

    self[1] = FrameContainer:new{
        width = screen_w,
        height = screen_h,
        background = Blitbuffer.COLOR_WHITE,
        bordersize = 0,
        padding = Size.padding.large,
        VerticalGroup:new{
            top_bar,
            VerticalSpan:new{ width = Size.span.vertical_large },
            self.cropping_widget,
        },
    }
end

function SheetView:onShow()
    UIManager:setDirty(self, "full")
    return true
end

function SheetView:onCloseWidget()
    UIManager:setDirty(nil, "full")
end

local CharacterSheet = WidgetContainer:extend{
    name = "charactersheet",
    is_doc_only = false,
}

function CharacterSheet:init()
    self.ui.menu:registerToMainMenu(self)
end

function CharacterSheet:addToMainMenu(menu_items)
    menu_items.charactersheet = {
        text = _("Character Sheet"),
        sorting_hint = "more_tools",
        callback = function()
            self:openSheet()
        end,
    }
end

function CharacterSheet:getServerUrl()
    return G_reader_settings:readSetting("charactersheet_server", DEFAULT_SERVER)
end

-- Minimal JSON-over-HTTP helper, modeled on plugins/wallabag.koplugin's callAPI.
function CharacterSheet:callAPI(method, path, body)
    local sink = {}
    local request = {
        method = method,
        url = self:getServerUrl() .. path,
        sink = ltn12.sink.table(sink),
    }
    if body ~= nil then
        local body_json = JSON.encode(body)
        request.headers = {
            ["Content-Type"] = "application/json",
            ["Content-Length"] = tostring(#body_json),
        }
        request.source = ltn12.source.string(body_json)
    end

    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code, resp_headers = socket.skip(1, http.request(request))
    socketutil:reset_timeout()

    if resp_headers == nil then
        return false, nil
    end

    local content = table.concat(sink)
    if content ~= "" then
        local ok, result = pcall(JSON.decode, content)
        if ok then
            return code == 200, result
        end
    end
    return code == 200, nil
end

function CharacterSheet:openSheet()
    local char_id = G_reader_settings:readSetting("charactersheet_char_id")
    if char_id then
        self:loadCharacter(char_id)
    else
        self:pickCharacter()
    end
end

function CharacterSheet:switchCharacter()
    G_reader_settings:delSetting("charactersheet_char_id")
    self.expanded_ability_id = nil
    self:pickCharacter()
end

function CharacterSheet:pickCharacter()
    local ok, list = self:callAPI("GET", "/api/kindle/characters")
    if not ok or not list then
        UIManager:show(InfoMessage:new{
            text = _("Could not reach ScreenSage. Check it's running and reachable at ") .. self:getServerUrl(),
        })
        return
    end

    -- "+ New Character" always leads, even when the roster is empty, so an
    -- empty server isn't a dead end.
    local kv_pairs = {}
    table.insert(kv_pairs, {
        _("+ New Character"), "",
        callback = function()
            self:promptNewCharacter()
        end,
    })
    for _, c in ipairs(list) do
        table.insert(kv_pairs, {
            c.name,
            c.class .. " - Level " .. tostring(c.level),
            callback = function()
                G_reader_settings:saveSetting("charactersheet_char_id", c.id)
                UIManager:close(self.picker_widget)
                self:loadCharacter(c.id)
            end,
        })
    end

    self.picker_widget = KeyValuePage:new{
        title = _("Select Your Character"),
        kv_pairs = kv_pairs,
    }
    UIManager:show(self.picker_widget)
end

-- Name + class only - the server defaults everything else (level 0, 4/4 HP,
-- empty stats/abilities) for the GM to fill in later by hand-editing the
-- JSON file, same as any other character.
function CharacterSheet:promptNewCharacter()
    local dialog
    dialog = MultiInputDialog:new{
        title = _("New Character"),
        fields = {
            { hint = _("Name") },
            { hint = _("Class") },
        },
        buttons = {
            {
                {
                    text = _("Cancel"),
                    id = "close",
                    callback = function() UIManager:close(dialog) end,
                },
                {
                    text = _("Create"),
                    callback = function()
                        local fields = dialog:getFields()
                        local name = fields[1]
                        local class_name = fields[2]
                        if name == "" or class_name == "" then
                            return
                        end
                        UIManager:close(dialog)
                        self:createCharacter(name, class_name)
                    end,
                },
            },
        },
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

function CharacterSheet:createCharacter(name, class_name)
    local ok, data = self:callAPI("POST", "/api/kindle/character/create", { name = name, class = class_name })
    if not ok or not data then
        UIManager:show(InfoMessage:new{ text = _("Failed to create character.") })
        return
    end
    if self.picker_widget then
        UIManager:close(self.picker_widget)
    end
    G_reader_settings:saveSetting("charactersheet_char_id", data.id)
    self:loadCharacter(data.id)
end

function CharacterSheet:loadCharacter(char_id)
    self.char_id = char_id
    self.expanded_ability_id = nil
    local ok, data = self:callAPI("GET", "/api/kindle/character?char=" .. char_id)
    if not ok or not data then
        UIManager:show(InfoMessage:new{ text = _("Could not load that character from the server.") })
        return
    end
    self.character = data
    self:renderSheet()
end

function CharacterSheet:renderSheet()
    if self.sheet_widget then
        UIManager:close(self.sheet_widget)
    end
    self.sheet_widget = SheetView:new{
        character = self.character,
        plugin = self,
    }
    UIManager:show(self.sheet_widget)
end

function CharacterSheet:toggleAbility(ability_id)
    if self.expanded_ability_id == ability_id then
        self.expanded_ability_id = nil
    else
        self.expanded_ability_id = ability_id
    end
    self:renderSheet()
end

function CharacterSheet:showHPDialog()
    local dialog
    dialog = ButtonDialog:new{
        title = _("HP: ") .. tostring(self.character.hp.current) .. " / " .. tostring(self.character.hp.max),
        buttons = {
            {
                { text = "-1", callback = function() self:adjustHP(-1, dialog) end },
                { text = "+1", callback = function() self:adjustHP(1, dialog) end },
            },
            {
                { text = _("Close"), callback = function() UIManager:close(dialog) end },
            },
        },
    }
    UIManager:show(dialog)
end

function CharacterSheet:adjustHP(delta, dialog)
    local ok, data = self:callAPI("POST", "/api/kindle/hp?char=" .. self.char_id, { delta = delta })
    if ok and data then
        self.character = data
        UIManager:close(dialog)
        self:renderSheet()
    end
end

function CharacterSheet:useAbility(ability_id, action)
    local ok, data = self:callAPI("POST", "/api/kindle/ability/" .. ability_id .. "/" .. action .. "?char=" .. self.char_id, {})
    if not ok or not data then
        return
    end
    self.character = data
    self:renderSheet()
end

return CharacterSheet
