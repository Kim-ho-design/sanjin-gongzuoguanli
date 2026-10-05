#!/usr/bin/perl
# dump → samples-data.json：把已解析的历史成稿 dump 转成脚本工作台导入格式
#
# 输入（本机 .tmp_extract 下的文本 dump，由源 Excel 解包 XML 后生成）：
#   xlsx9_dump.txt    一站式抖音 9 月：SHEET 分块；除「9月选题」外每期一个 sheet
#   xlsx_lc_dump.txt  力辰脚本沟通表：N月/第X期 分块；只收发文标题含 徕乔/LACHOI 的块
#   docx_text2.txt    经理范本食糖脚本（单篇，手工映射）
#
# 输出：samples-data.json { generated_at, sources: {...}, samples: [...] }
#   每条 {account, title, direction, notes, source, content:{...}}；status/is_sample 由导入器负责（已发布/待认可）
#
# 再生成流程（samples-data.json 丢了怎么重建）：
#   1. 源 Excel/Docx（企划部工作管理系统/ 下）→ 解压（xlsx 是 zip）取 xl/worksheets/*.xml、word/document.xml
#   2. 用脚本把 XML 里的文本节点按行/列 dump 成 `列1 | 列2 | ...` 的纯文本（即上述三个 dump 的生成方式）
#   3. 运行本脚本：perl scripts/import/dump-to-json.pl
use strict;
use warnings;
use utf8;
use JSON::PP ();

binmode STDOUT, ':encoding(UTF-8)';

my $DUMP_DIR = $ENV{DUMP_DIR} // 'C:/Users/kimho/Desktop/coding项目/.tmp_extract';
my $OUT      = $ENV{OUT}      // 'C:/Users/kimho/Desktop/coding项目/个人工作进度管理看板/work-os/scripts/import/samples-data.json';

my (@samples, %stats);

# ---------- 通用工具 ----------
sub read_lines {
  my ($file) = @_;
  open my $fh, '<:encoding(UTF-8)', "$DUMP_DIR/$file" or die "cannot open $file: $!";
  my @lines = map { my $s = $_; $s =~ s/\s+$//; $s } <$fh>;
  close $fh;
  return @lines;
}

# 尾部元数据列（http 参考链接、9.9/9.17 日期、空列）剥掉后取最后一列实质内容。
# 规则：首个含 http 的字段是参考资料列起点 → 取它前面最后一个非空列；无 http → 从尾往前跳过日期/空列取第一非空。
sub pick_content {
  my @f = @_;
  for my $i (1 .. $#f) {
    if ($f[$i] =~ /http/i) {
      for my $j (reverse 1 .. $i - 1) {
        my $v = trim($f[$j]);
        return $v if $v ne '';
      }
      return '';
    }
  }
  for my $j (reverse 1 .. $#f) {
    my $v = trim($f[$j]);
    next if $v eq '';
    next if $v =~ /^\d{1,2}\.\d{1,2}$/;      # 9.9 / 9.17 日期
    next if $v =~ /^\d{1,2}月\d{1,2}期?$/;
    return $v;
  }
  return '';
}

sub trim {
  my ($s) = @_;
  $s = '' unless defined $s;
  $s =~ s/^\s+//;
  $s =~ s/\s+$//;
  return $s;
}

sub split_fields {
  my ($line) = @_;
  return map { defined $_ ? trim($_) : '' } split /\s*\|\s*/, $line, -1;
}

# 机械断句竖排：按句读（。！？；）与已有换行断行，一句一行；<8 字的短句与下一句合并避免过碎；
# 含（字幕：…）（画面：…）括注的句子整句跟走不断开
sub verticalize {
  my ($text) = @_;
  my @sents =
    grep { $_ ne '' }
    map { my $s = trim($_); $s }
    split /(?<=[。！？；])|\n+/, $text;
  my (@lines, $buf);
  for my $i (0 .. $#sents) {
    my $s = $sents[$i];
    if (defined $buf) {
      push @lines, $buf . $s;
      $buf = undef;
    } elsif (length($s) < 8 && $i < $#sents) {
      $buf = $s;    # 短句先攒着，与下一句合并
    } else {
      push @lines, $s;
    }
  }
  push @lines, $buf if defined $buf;
  return join("\n", @lines);
}

# ---------- 一站式（xlsx9_dump） ----------
sub parse_yizhanshi {
  my @lines = read_lines('xlsx9_dump.txt');
  my (@sheets, $cur);
  for my $line (@lines) {
    if ($line =~ /^===== SHEET: (.+?) \[state=/) {
      push @sheets, $cur if $cur;
      $cur = { name => $1, lines => [] };
      next;
    }
    push @{$cur->{lines}}, $line if $cur;
  }
  push @sheets, $cur if $cur;

  for my $sheet (@sheets) {
    my $name = $sheet->{name};
    next if $name =~ /选题/;    # 第一个 sheet 是选题表
    (my $title = $name) =~ s/^\d+\.\d+//;
    $title = trim($title);
    my %row;                    # cover_title/positioning/framework/audience/keywords/narration/end_card
    for my $line (@{$sheet->{lines}}) {
      next unless $line =~ /\|/;
      my @f = split_fields($line);
      my $key = $f[0] // '';
      if ($key =~ /^(封面|标题)$/) {
        $row{cover_title} //= trim($f[1] // '');
      } elsif ($key eq '视频定位') {
        $row{positioning} = pick_content(@f);
      } elsif ($key eq '框架思路') {
        $row{framework} = pick_content(@f);
      } elsif ($key eq '目标人群') {
        $row{audience} = pick_content(@f);
      } elsif ($key eq '关键词') {
        my $kw = pick_content(@f);
        $row{keywords} = [ grep { $_ ne '' } map { trim($_) } split /[、，,]/, $kw ];
      } elsif ($key eq '脚本') {
        $row{narration} = pick_content(@f);
      } elsif ($key eq '片尾落版文案') {
        $row{end_card} = pick_content(@f);
      }
    }
    if (($row{narration} // '') eq '') {
      push @{$stats{yizhanshi}{skipped}}, "$name（无脚本正文）";
      next;
    }
    push @samples, {
      account   => 'yizhanshi',
      title     => $title,
      direction => $title,
      notes     => '',
      source    => "xlsx9:$name",
      content   => {
        cover_title => $row{cover_title} // '',
        positioning => $row{positioning} // '',
        framework   => $row{framework}   // '',
        audience    => $row{audience}    // '',
        keywords    => $row{keywords}    // [],
        body        => verticalize($row{narration}),
        progress_nodes => [],
        end_card => $row{end_card} // '',
      },
    };
    $stats{yizhanshi}{parsed}++;
  }
}

# ---------- 徕乔（xlsx_lc_dump） ----------
sub parse_laiqiao {
  my @lines = read_lines('xlsx_lc_dump.txt');
  my (@blocks, $cur);
  for my $line (@lines) {
    if ($line =~ /^\s*(\d+月\/第\d+期)/) {
      push @blocks, $cur if $cur;
      $cur = { tag => $1, lines => [] };
      next;
    }
    push @{$cur->{lines}}, $line if $cur;
  }
  push @blocks, $cur if $cur;

  for my $block (@blocks) {
    my $tag = $block->{tag};
    # 拆并排双期：第二次出现 封面标题/发文标题 字段处切开（记录行号+字段下标）
    my ($split_line, $split_idx);
    OUTER: for my $li (0 .. $#{$block->{lines}}) {
      my @f = split_fields($block->{lines}[$li]);
      my $seen = 0;
      for my $fi (0 .. $#f) {
        $seen++ if $f[$fi] eq '封面标题' || $f[$fi] eq '发文标题';
        if ($seen == 2) { ($split_line, $split_idx) = ($li, $fi); last OUTER; }
      }
    }

    my @segments = ( [] );      # 每个 segment 是 fields 数组的列表
    for my $li (0 .. $#{$block->{lines}}) {
      my @f = split_fields($block->{lines}[$li]);
      if (defined $split_line && $li == $split_line) {
        push @{$segments[0]}, [ map { defined $_ ? $_ : '' } @f[0 .. $split_idx - 1] ] if $split_idx > 0;
        push @segments, [ [ map { defined $_ ? $_ : '' } @f[$split_idx .. $#f] ] ];
      } elsif (defined $split_line && $li > $split_line) {
        # 并排双期：后续行的列同样按 split_idx 切开，前半归左期、后半归右期
        push @{$segments[0]}, [ map { defined $_ ? $_ : '' } @f[0 .. $split_idx - 1] ] if $split_idx > 0;
        push @{$segments[1]}, [ map { defined $_ ? $_ : '' } @f[$split_idx .. $#f] ];
      } else {
        push @{$segments[0]}, \@f;
      }
    }

    my $kept = 0;
    for my $si (0 .. $#segments) {
      my @rows = @{$segments[$si]};
      my ($cover, $post, $header_idx, %col);
      for my $ri (0 .. $#rows) {
        my @f = @{$rows[$ri]};
        next unless @f;
        if (!defined $cover && $f[0] eq '封面标题') { $cover = trim($f[1] // ''); next; }
        if (!defined $post  && $f[0] eq '发文标题') { $post  = trim($f[1] // ''); next; }
        # 表头：场景/镜头设计 开头，且含台词类列或呈现/字幕列（部分视觉片没有同期声列）
        my $vo_cols = grep { /台词|同期声|内容/ } @f[1 .. $#f];
        my $pv_cols = grep { /呈现|字幕/ } @f[1 .. $#f];
        if (!defined $header_idx && $f[0] =~ /^(场景|镜头设计)$/ && ($vo_cols || $pv_cols)) {
          $header_idx = $ri;
          for my $i (1 .. $#f) {
            my $h = $f[$i];
            $col{voiceover} //= $i if $h =~ /同期声|台词|内容/;
            $col{visual}    //= $i if $h =~ /呈现/ && $h !~ /字幕/;
            $col{subtitle}  //= $i if $h =~ /^字幕/;
            $col{note}      //= $i if $h =~ /分镜备注|备注|分镜/;
          }
          $col{note} //= -1;
        }
      }
      if (!defined $post) {
        push @{$stats{laiqiao}{skipped}}, "$tag 段" . ($si + 1) . "（无发文标题）" unless @segments == 1 && $si == 0 && !$kept;
        next;
      }
      if ($post !~ /徕乔|LACHOI/i) {
        next;    # 非徕乔块直接跳过（力辰主账号内容不入样稿库）
      }
      if (!defined $header_idx) {
        push @{$stats{laiqiao}{skipped}}, "$tag 段$si（无分镜表头，post=$post）";
        next;
      }
      my @out_rows;
      for my $ri ($header_idx + 1 .. $#rows) {
        my @f = @{$rows[$ri]};
        next unless grep { $_ ne '' } @f;
        my $get = sub { my ($i) = @_; return ($i >= 0 && $i <= $#f) ? trim($f[$i]) : ''; };
        my %r = (
          voiceover => $get->($col{voiceover} // -1),
          visual    => $get->($col{visual}    // -1),
          subtitle  => $get->($col{subtitle}  // -1),
          note      => $get->($col{note}      // -1),
        );
        next unless grep { $_ ne '' } values %r;
        push @out_rows, { node_label => '', voiceover => $r{voiceover}, visual => $r{visual}, subtitle => $r{subtitle}, note => $r{note} };
      }
      if (!@out_rows) {
        push @{$stats{laiqiao}{skipped}}, "$tag 段$si（分镜数据行为空）";
        next;
      }
      my $title = $cover ne '' ? $cover : substr($post, 0, 30);
      # 徕乔 content v3（三板块）：voiceover 竖排合并；visual/subtitle 去重以「；」join 并截断
      my %seen_v; my @visuals = grep { $_ ne '' && !$seen_v{$_}++ } map { $_->{visual} } @out_rows;
      my %seen_s; my @subs = grep { $_ ne '' && !$seen_s{$_}++ } map { $_->{subtitle} } @out_rows;
      my $visual_advice = substr(join('；', @visuals), 0, 500);
      my $subtitle_advice = substr(join('；', @subs), 0, 300);
      push @samples, {
        account   => 'laiqiao',
        title     => $title,
        direction => $title,
        notes     => '',
        source    => "xlsx_lc:$tag" . (@segments > 1 ? " 段$si" : ''),
        content   => {
          cover_title     => $cover,
          post_title      => $post,
          voiceover_body  => join("\n", grep { $_ ne '' } map { $_->{voiceover} } @out_rows),
          visual_advice   => $visual_advice,
          subtitle_advice => $subtitle_advice,
        },
      };
      $stats{laiqiao}{parsed}++;
      $kept++;
    }
  }
}

# ---------- 食糖范本（docx_text2.txt，手工映射） ----------
sub parse_shitang {
  push @samples, {
    account   => 'yizhanshi',
    title     => '食糖生产许可细则修订 8类糖7大指标仪器配置（经理范本）',
    direction => '食糖生产许可细则修订：8 类糖 7 大指标仪器配置',
    notes     => '经理范本，建议优先认可为样稿',
    source    => 'docx:食糖生产许可细则修订',
    content   => {
      cover_title => '食糖生产许可细则修订 8类糖7大指标仪器配置',
      positioning => '政策解读+行业干货+仪器配置清单',
      framework   => '痛点钩子（新规时机窗口）→扩禁控管解读→逐指标检测方案→资料引流',
      audience    => '制糖企业（糖厂）质检/化验室负责人、食品生产企业品控、第三方检测机构、食糖贸易商',
      keywords    => [ '食糖生产许可', '食糖检测', '仪器配置', '红糖新规', '掺假鉴别', '实验室建设' ],
      # 一体文档：6 节旁白合并 + 机械断句竖排（段间保留空行），节点单独成数组
      body        => join("\n\n", map { verticalize($_) } split /\n\n/, (
          "时隔二十年，食糖生产许可细则第一次大改。糖厂的化验室，这次真的要补仪器了。\n（字幕：20 年首次修订｜10.16截止）\n\n" .
          "核心就四个字：扩、禁、控、管。扩——红糖、液体糖全部纳入许可；禁——食糖里不许加淀粉糖；控——二氧化硫残留要有完整监控记录；管——分装企业原料和成品都得建检验制度。\n（字幕：扩 · 禁 · 控 · 管）\n\n" .
          "问题来了：监管怎么知道你到底加没加？靠嘴说没用。靠仪器。\n（字幕：怎么查？靠仪器）\n\n" .
          "第一关，蔗糖分——自动旋光仪，精度能做到正负零点零零五个糖度，几十秒出结果。\n" .
          "第二关，色值——紫外可见分光光度计，四百二十纳米，国标分级：精制二十五以内，二级二百四十。\n" .
          "第三关，二氧化硫——老办法比色太慢，现在气相色谱法效率提三倍以上，离子色谱也能直接测亚硫酸根。\n" .
          "第四关，重金属——原子吸收测铅砷镉，原子荧光测砷汞，做出口的直接上ICP-MS。\n" .
          "第五关，微生物——菌落总数一百以内，PCR快检把三到五天压到几个小时。\n" .
          "第六关，也是最要命的一关：怎么证明你没加淀粉糖？稳定同位素比值质谱，测碳同位素——甘蔗、玉米是 C4 植物，甜菜是C3植物，一测就露馅。\n" .
          "传统实验室检测虽然精准，但慢。现在产线上直接挂在线近红外，一秒几十次数据，水分实时控，还能顺带省下干燥的能耗。\n\n" .
          "我把八类糖、七大检测指标对应的仪器配置，加上一份实验室合规自查清单，整理好了。评论区留\"食糖\"，或私我。也欢迎转给你们的质检负责人。\n\n" .
          "末尾附 4 份引流干货：一、食糖八大门类速查（GB/T 35886-2018）；二、八类糖+七大检测指标必检矩阵（必检/建议检/按需）；三、七大检测指标+仪器配置对照表；四、实验室合规自查清单 10 条。")),
      progress_nodes => [ '开头', '新规', '痛点', '方案', '收尾', '附录' ],
      end_card => '收藏这份配置清单',
    },
  };
  $stats{docx}{parsed} = 1;
}

parse_yizhanshi();
parse_laiqiao();
parse_shitang();

my $data = {
  generated_at => scalar(localtime),
  sources      => \%stats,
  samples      => \@samples,
};

open my $out, '>:raw', $OUT or die "cannot write $OUT: $!";
print {$out} JSON::PP->new->utf8->pretty->canonical->encode($data);
close $out;

printf "yizhanshi: %d parsed, %d skipped\n", $stats{yizhanshi}{parsed} // 0, scalar @{$stats{yizhanshi}{skipped} // []};
printf "laiqiao:   %d parsed, %d skipped\n", $stats{laiqiao}{parsed} // 0, scalar @{$stats{laiqiao}{skipped} // []};
printf "docx:      %d parsed\n", $stats{docx}{parsed} // 0;
printf "total:     %d samples -> %s\n", scalar @samples, $OUT;
