mod app_state {
    pub use copet_lib::app_state::*;
}

mod subject {
    #![allow(dead_code)]

    include!("../src/window_placement.rs");

    #[test]
    fn calculates_bottom_right_position_with_margin() {
        let position = bottom_right_position(
            PhysicalPosition { x: 100, y: 50 },
            PhysicalSize {
                width: 1920,
                height: 1080,
            },
            PhysicalSize {
                width: 420,
                height: 520,
            },
            24,
        );

        assert_eq!(position, PhysicalPosition { x: 1576, y: 586 });
    }

    #[test]
    fn calculates_startup_positions_from_screen_edge_to_default_target() {
        let (start, target) = pet_startup_window_positions(
            PhysicalPosition { x: 100, y: 50 },
            PhysicalSize {
                width: 1920,
                height: 1080,
            },
            PhysicalSize {
                width: 420,
                height: 520,
            },
            24,
        );

        // start: horizontal center on the monitor's right edge (left half on
        // screen, right half hangs off). target: default bottom-right with
        // margin. Slide distance = window_width/2 + margin.
        assert_eq!(start, PhysicalPosition { x: 1810, y: 586 });
        assert_eq!(target, PhysicalPosition { x: 1576, y: 586 });
    }

    #[test]
    fn startup_target_stays_clamped_on_small_monitor() {
        let (start, target) = pet_startup_window_positions(
            PhysicalPosition { x: -100, y: 20 },
            PhysicalSize {
                width: 300,
                height: 200,
            },
            PhysicalSize {
                width: 420,
                height: 520,
            },
            24,
        );

        // start: -100 + 300 - 420/2 = -10. target clamps to monitor origin
        // when the window is wider than the monitor.
        assert_eq!(start, PhysicalPosition { x: -10, y: 20 });
        assert_eq!(target, PhysicalPosition { x: -100, y: 20 });
    }

    #[test]
    fn startup_interpolation_reaches_exact_target() {
        let start = PhysicalPosition { x: 2020, y: 586 };
        let target = PhysicalPosition { x: 1576, y: 586 };

        assert_eq!(interpolate_position(start, target, 0.0), start);
        assert_eq!(interpolate_position(start, target, 1.0), target);
    }

    #[test]
    fn does_not_place_window_above_monitor_origin_when_window_is_large() {
        let position = bottom_right_position(
            PhysicalPosition { x: -100, y: 20 },
            PhysicalSize {
                width: 300,
                height: 200,
            },
            PhysicalSize {
                width: 420,
                height: 520,
            },
            24,
        );

        assert_eq!(position, PhysicalPosition { x: -100, y: 20 });
    }

    #[test]
    fn maps_pet_window_slider_value_to_logical_dimensions() {
        assert_eq!(pet_window_logical_dimensions(1), (95.0, 110.0));
        assert_eq!(pet_window_logical_dimensions(70), (217.0, 249.4));
        assert_eq!(pet_window_logical_dimensions(100), (270.0, 310.0));
        assert_eq!(pet_window_logical_dimensions(0), (95.0, 110.0));
    }

    #[test]
    fn pet_window_z_order_policy_survives_macos_app_switching() {
        assert_eq!(
            pet_window_z_order_policy(),
            PetWindowZOrderPolicy {
                macos_floating_level: false,
                macos_screen_saver_level: true,
                visible_on_all_workspaces: true,
                visible_on_all_applications: true,
                stationary_across_spaces: true,
                fullscreen_auxiliary: true,
                ignores_window_cycle: true,
                hides_on_deactivate: false,
                can_hide: false,
                focusable: false,
                orders_front_regardless: true,
                restores_visibility: true,
                deminiaturizes: true,
                unhides_application_without_activation: true,
                windows_hwnd_topmost: true,
                windows_no_activate: true,
            }
        );
    }

    #[test]
    fn pet_window_z_order_policy_focusable_strategy() {
        let policy = format!("{:?}", pet_window_z_order_policy());

        assert!(policy.contains("focusable: false"));
    }

    #[test]
    fn pet_window_config_starts_non_focusable() {
        let config = include_str!("../tauri.conf.json");
        let pet_window_config = config
            .split("\"label\": \"pet\"")
            .nth(1)
            .and_then(|rest| rest.split("\"label\": \"settings\"").next())
            .expect("pet window config should be present before settings window config");

        assert!(pet_window_config.contains("\"focusable\": false"));
    }

    #[test]
    fn pet_window_config_does_not_rely_on_tauri_always_on_top() {
        let config = include_str!("../tauri.conf.json");
        let pet_window_config = config
            .split("\"label\": \"pet\"")
            .nth(1)
            .and_then(|rest| rest.split("\"label\": \"settings\"").next())
            .expect("pet window config should be present before settings window config");

        assert!(!pet_window_config.contains("\"alwaysOnTop\": true"));
    }

    #[test]
    fn pet_window_policy_uses_screen_saver_level_for_fullscreen_apps() {
        let policy = format!("{:?}", pet_window_z_order_policy());

        assert!(policy.contains("macos_floating_level: false"));
        assert!(policy.contains("macos_screen_saver_level: true"));
        assert!(policy.contains("visible_on_all_workspaces: true"));
        assert!(policy.contains("stationary_across_spaces: true"));
        assert!(policy.contains("fullscreen_auxiliary: true"));
        assert!(policy.contains("hides_on_deactivate: false"));
    }

    #[test]
    fn pet_window_topmost_path_does_not_use_tauri_always_on_top_on_macos() {
        let source = include_str!("../src/window_placement.rs");
        let keep_pet_window_on_top = source
            .split("pub fn keep_pet_window_on_top")
            .nth(1)
            .and_then(|rest| rest.split("pub fn reassert_pet_window_on_top").next())
            .expect("keep_pet_window_on_top body should exist");

        assert!(!keep_pet_window_on_top.contains("set_always_on_top"));
    }

    #[test]
    fn pet_window_z_order_policy_survives_macos_space_switching() {
        let policy = pet_window_z_order_policy();

        assert!(policy.macos_screen_saver_level);
        assert!(policy.visible_on_all_applications);
        assert!(policy.orders_front_regardless);
        assert!(policy.restores_visibility);
        assert!(policy.deminiaturizes);
        assert!(policy.unhides_application_without_activation);
        assert!(!policy.can_hide);
    }

    #[test]
    fn pet_window_z_order_guard_reasserts_after_system_window_reordering() {
        assert_eq!(
            pet_window_reassertion_delays_ms(),
            &[0, 120, 360, 900, 1_800, 3_200]
        );
    }

    #[test]
    fn pet_window_focus_loss_requests_z_order_reassertion_on_all_platforms() {
        assert!(pet_window_event_needs_z_order_reassertion(
            "pet",
            &tauri::WindowEvent::Focused(false)
        ));
        assert!(!pet_window_event_needs_z_order_reassertion(
            "pet",
            &tauri::WindowEvent::Focused(true)
        ));
        assert!(!pet_window_event_needs_z_order_reassertion(
            "settings",
            &tauri::WindowEvent::Focused(false)
        ));
    }

    #[test]
    fn pet_window_reassertion_restores_hidden_or_minimized_windows() {
        let source = include_str!("../src/window_placement.rs");

        assert!(source.contains("unhideWithoutActivation"));
        assert!(source.contains("deminiaturize"));
        assert!(source.contains("window.show()"));
    }

    #[test]
    fn pet_window_z_order_guard_observes_hide_deactivate_and_occlusion_events() {
        let source = include_str!("../src/window_placement.rs");

        assert!(source.contains("NSWorkspaceDidHideApplicationNotification"));
        assert!(source.contains("NSWorkspaceDidDeactivateApplicationNotification"));
        assert!(source.contains("NSWorkspaceDidWakeNotification"));
        assert!(source.contains("NSApplicationDidHideNotification"));
        assert!(source.contains("NSApplicationDidResignActiveNotification"));
        assert!(source.contains("NSApplicationDidChangeOcclusionStateNotification"));
    }

    #[test]
    fn windows_pet_window_reassertion_uses_native_no_activate_topmost() {
        let source = include_str!("../src/window_placement.rs");

        assert!(source.contains("SetWindowPos"));
        assert!(source.contains("HWND_TOPMOST"));
        assert!(source.contains("SWP_NOACTIVATE"));
        assert!(source.contains("SWP_NOMOVE | SWP_NOSIZE"));
    }

    #[test]
    fn pet_window_z_order_guard_pauses_while_settings_is_focused() {
        assert!(!pet_window_reassertion_allowed(true));
        assert!(pet_window_reassertion_allowed(false));
    }

    #[test]
    fn pet_window_z_order_guard_does_not_unhide_a_user_hidden_window() {
        let source = include_str!("../src/window_placement.rs");
        let body = source
            .split("pub fn reassert_pet_window_on_top")
            .nth(1)
            .and_then(|rest| {
                rest.split("pub fn pet_window_event_needs_z_order_reassertion")
                    .next()
            })
            .expect("reassert_pet_window_on_top body should exist");

        assert!(
            body.contains("is_visible"),
            "guard must check is_visible() before reasserting so toggle_pet_window_visibility's hide() sticks"
        );
    }

    #[test]
    fn pet_window_z_order_guard_does_not_poll_while_user_may_be_dragging_settings() {
        assert!(!include_str!("../src/window_placement.rs").contains("WATCHDOG"));
    }

    #[test]
    fn settings_window_interaction_policy_keeps_settings_below_pet() {
        assert_eq!(
            settings_window_interaction_policy(),
            SettingsWindowInteractionPolicy {
                macos_normal_level: true,
                macos_screen_saver_level: false,
                orders_front_regardless: false,
            }
        );
    }

    #[test]
    fn settings_window_config_does_not_compete_with_pet_topmost_level() {
        let config = include_str!("../tauri.conf.json");
        let settings_window_config = config
            .split("\"label\": \"settings\"")
            .nth(1)
            .expect("settings window config should be present");

        assert!(!settings_window_config.contains("\"alwaysOnTop\": true"));
    }

    #[test]
    fn settings_window_config_is_visible_on_startup() {
        let config = include_str!("../tauri.conf.json");
        let settings_window_config = config
            .split("\"label\": \"settings\"")
            .nth(1)
            .expect("settings window config should be present");

        assert!(!settings_window_config.contains("\"visible\": false"));
    }

    #[test]
    fn settings_window_default_width_is_770() {
        let config = include_str!("../tauri.conf.json");
        let settings_window_config = config
            .split("\"label\": \"settings\"")
            .nth(1)
            .expect("settings window config should be present");

        assert!(settings_window_config.contains("\"width\": 770"));
    }

    #[test]
    fn settings_window_uses_app_title_for_system_window_label() {
        let config = include_str!("../tauri.conf.json");
        let settings_window_config = config
            .split("\"label\": \"settings\"")
            .nth(1)
            .expect("settings window config should be present");

        assert!(settings_window_config.contains("\"title\": \"CoPet\""));
        assert!(!settings_window_config.contains("\"title\": \"CoPet Settings\""));
    }

    #[test]
    fn calculates_resize_position_from_existing_window_center() {
        let position = center_anchored_position(
            PhysicalPosition { x: 100, y: 200 },
            PhysicalSize {
                width: 230,
                height: 265,
            },
            PhysicalSize {
                width: 280,
                height: 325,
            },
        );

        assert_eq!(position, PhysicalPosition { x: 75, y: 170 });
    }

    #[test]
    fn pet_window_size_command_leaves_content_sizing_to_frontend() {
        let source = include_str!("../src/lib.rs");
        let set_pet_window_size = source
            .split("fn set_pet_window_size")
            .nth(1)
            .and_then(|rest| rest.split("#[tauri::command]").next())
            .expect("set_pet_window_size command should exist");

        assert!(!set_pet_window_size.contains("resize_pet_window_from_center"));
    }

    #[test]
    fn app_setup_places_pet_window_at_startup_start() {
        let source = include_str!("../src/lib.rs");
        let setup_body = source
            .split(".setup(|app|")
            .nth(1)
            .and_then(|rest| rest.split("install_pet_window_z_order_guard").next())
            .expect("app setup body should configure the pet window before z-order guard");

        assert!(setup_body.contains("apply_pet_window_size_for_startup"));
        assert!(!setup_body.contains("apply_pet_window_size(&window"));
    }

    #[test]
    fn startup_window_command_symbol_is_registered() {
        let source = include_str!("../src/lib.rs");

        assert!(source.contains("commands::run_pet_startup_window_animation"));
    }

    #[test]
    fn startup_window_command_preserves_tray_hidden_pet() {
        let source = include_str!("../src/commands.rs");
        let body = source
            .split("pub fn run_pet_startup_window_animation")
            .nth(1)
            .and_then(|rest| rest.split("#[tauri::command]").next())
            .unwrap_or(source);

        assert!(
            body.contains("is_visible"),
            "startup animation command must inspect visibility before applying z-order"
        );
        assert!(
            body.contains("return Ok(false)"),
            "startup animation command must no-op and report hidden startup as not visibly completed"
        );
    }

    #[test]
    fn startup_window_command_settles_position_on_animation_error() {
        let source = include_str!("../src/commands.rs");
        let body = source
            .split("pub fn run_pet_startup_window_animation")
            .nth(1)
            .and_then(|rest| rest.split("#[tauri::command]").next())
            .unwrap_or(source);

        assert!(body.contains("animate_pet_window_from_offscreen_right"));
        assert!(
            body.contains("place_window_bottom_right"),
            "startup animation command must settle the native window before reporting an animation error"
        );
    }

    #[test]
    fn startup_animation_settles_hidden_window_without_reasserting_after_mid_animation_hide() {
        let start = PhysicalPosition { x: 200, y: 40 };
        let target = PhysicalPosition { x: 100, y: 40 };
        let mut visibility_checks = 0;
        let mut elapsed_ms = 16;
        let mut positions = Vec::new();
        let mut keep_on_top_count = 0;

        let completed = animate_pet_window_positions_while_visible(
            start,
            target,
            32,
            || {
                visibility_checks += 1;
                Ok(visibility_checks < 3)
            },
            |position| {
                positions.push(position);
                Ok(())
            },
            || {
                keep_on_top_count += 1;
                Ok(())
            },
            |_| {},
            || {
                let elapsed = elapsed_ms;
                elapsed_ms += 16;
                elapsed
            },
        )
        .expect("animation helper should stop cleanly after hide");

        assert!(
            !completed,
            "hidden mid-animation pet should report that startup did not visibly complete"
        );
        assert_eq!(positions.first(), Some(&start));
        assert_eq!(
            positions.last(),
            Some(&target),
            "hidden mid-animation pet should settle to the normal target for the next tray show"
        );
        assert_eq!(
            keep_on_top_count, 1,
            "only the initial visible reassertion should run before the hide"
        );
    }

    #[test]
    fn toggle_pet_window_visibility_reasserts_policy_synchronously_on_show() {
        let source = include_str!("../src/lib.rs");
        let show_branch = source
            .split("fn toggle_pet_window_visibility")
            .nth(1)
            .and_then(|rest| rest.split("} else {").nth(1))
            .and_then(|rest| rest.split('}').next())
            .expect("toggle_pet_window_visibility show branch should exist");

        assert!(
            show_branch.contains("keep_pet_window_on_top"),
            "show path must re-apply the z-order policy synchronously so the pet \
             window lands on the current Space (including another app's fullscreen \
             Space) instead of relying on async reassertion"
        );
        assert!(
            !show_branch.contains("window.show()"),
            "plain window.show() does not put NSPanel on another app's fullscreen \
             Space; use keep_pet_window_on_top instead"
        );
    }
}
